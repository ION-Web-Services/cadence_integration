/**
 * DNC enforcement: applies decision-engine output to GHL (DND settings + tags),
 * records asserted state, sends the templated opt-in message, and pushes
 * optional notifications.
 */

import { GHLAPI } from './ghl-api';
import { contactDncState } from './consent';
import type { DncDecision } from '@/types';

// Tags are visibility outputs only — the decision engine never reads them.
// GHL normalizes all tags to lowercase on storage, so define and compare
// them lowercase everywhere.
export const DNC_TAG_USHEALTH = 'dnc-ushealth';
export const DNC_TAG_NATIONAL = 'dnc-national';
export const TAG_REPLY_WINDOW = 'dnc-reply-window';
export const TAG_OPTIN_CONFIRMED = 'dnc-optin-confirmed';

export function tagsForDncResult(result: { isBlacklist: boolean; isNationalDnc: boolean }): string[] {
  const tags: string[] = [];
  if (result.isBlacklist) tags.push(DNC_TAG_USHEALTH);
  if (result.isNationalDnc) tags.push(DNC_TAG_NATIONAL);
  return tags;
}

export async function fetchContact(
  ghlApi: GHLAPI,
  contactId: string
): Promise<{ phone: string | null; tags: string[] } | null> {
  try {
    const response = await ghlApi.makeRequest({
      method: 'GET',
      endpoint: `/contacts/${contactId}`,
    });

    if (!response.ok) {
      console.error('Failed to fetch contact:', { contactId, status: response.status });
      return null;
    }

    const data = await response.json();
    return {
      phone: data.contact?.phone || null,
      tags: data.contact?.tags || [],
    };
  } catch (error) {
    console.error('Error fetching contact:', error);
    return null;
  }
}

/**
 * Apply a DNC decision to a GHL contact: per-channel DND + merged tags.
 * Existing tags are always preserved; addTags/removeTags adjust only our own
 * DNC tags. Also records the asserted state for reconciliation.
 */
export async function applyDecision(
  ghlApi: GHLAPI,
  params: {
    locationId: string;
    contactId: string;
    phone: string;
    decision: DncDecision;
    addTags?: string[];
    removeTags?: string[];
  }
): Promise<boolean> {
  const { locationId, contactId, phone, decision, addTags = [], removeTags = [] } = params;

  try {
    const contact = await fetchContact(ghlApi, contactId);
    const existingTags = contact?.tags || [];
    // Case-insensitive merge: GHL lowercases tags, but old data may vary
    const removeSet = new Set(removeTags.map((tag) => tag.toLowerCase()));
    const mergedTags = [
      ...new Set([...existingTags, ...addTags].map((tag) => tag.toLowerCase())),
    ].filter((tag) => !removeSet.has(tag));

    const dndMessage = 'DNC - Do Not Contact';
    const response = await ghlApi.makeRequest({
      method: 'PUT',
      endpoint: `/contacts/${contactId}`,
      data: {
        // Global DND only when both channels are blocked; partial states are per-channel
        dnd: decision.smsBlocked && decision.callBlocked,
        dndSettings: {
          SMS: decision.smsBlocked
            ? { status: 'active', message: dndMessage }
            : { status: 'inactive', message: dndMessage },
          Call: decision.callBlocked
            ? { status: 'active', message: dndMessage }
            : { status: 'inactive', message: dndMessage },
        },
        tags: mergedTags,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to apply DNC decision:', {
        status: response.status,
        error: errorText,
        contactId,
        reason: decision.reason,
      });
      return false;
    }

    await contactDncState.upsert({
      location_id: locationId,
      contact_id: contactId,
      phone,
      sms_blocked: decision.smsBlocked,
      call_blocked: decision.callBlocked,
      reason: decision.reason,
    });

    console.log('DNC decision applied:', {
      contactId,
      reason: decision.reason,
      smsBlocked: decision.smsBlocked,
      callBlocked: decision.callBlocked,
      tags: mergedTags,
    });
    return true;
  } catch (error) {
    console.error('Error applying DNC decision:', error);
    return false;
  }
}

/**
 * Send the fixed opt-in confirmation request via SMS. The template is not
 * agent-editable — identity comes from the GHL location name (the agent's
 * sub-account name).
 */
export async function sendOptinMessage(
  ghlApi: GHLAPI,
  locationId: string,
  contactId: string
): Promise<{ messageId: string; conversationId?: string } | null> {
  try {
    let locationName = '';
    try {
      const locationInfo = await ghlApi.getLocationInfo(locationId);
      const location = locationInfo?.location as Record<string, unknown> | undefined;
      locationName = typeof location?.name === 'string' ? location.name : '';
    } catch {
      // Identity line is optional; send without it rather than fail
    }

    const intro = locationName ? `Hi, this is ${locationName}. ` : '';
    const message =
      `${intro}You reached out to us — reply YES to confirm you'd like to receive ` +
      `calls and texts from this number. Reply STOP to opt out.`;

    const response = await ghlApi.makeRequest({
      method: 'POST',
      endpoint: '/conversations/messages',
      data: { type: 'SMS', contactId, message },
      headers: { Version: '2021-04-15' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send opt-in message:', {
        status: response.status,
        error: errorText,
        contactId,
      });
      return null;
    }

    const data = await response.json();
    const messageId = data?.messageId || data?.msg?.id;
    if (!messageId) {
      console.error('Opt-in send returned no message id:', data);
      return null;
    }

    console.log('Opt-in message sent:', { contactId, messageId });
    return { messageId, conversationId: data?.conversationId };
  } catch (error) {
    console.error('Error sending opt-in message:', error);
    return null;
  }
}

/**
 * Optional external notification (Slack webhook etc.) for events that need
 * human eyes, e.g. a blacklisted contact reaching out. Fire-and-forget.
 */
export async function notify(event: string, payload: Record<string, unknown>): Promise<void> {
  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload }),
    });
  } catch (error) {
    console.error('Notify webhook failed:', error);
  }
}
