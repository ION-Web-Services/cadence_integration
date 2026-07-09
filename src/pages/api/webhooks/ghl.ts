import type { NextApiRequest, NextApiResponse } from 'next';
import { cadenceInstallations } from '@/lib/supabase';
import { getValidAccessToken } from '@/lib/token-manager';
import { GHLAPI } from '@/lib/ghl-api';
import { checkDnc } from '@/lib/dnc-checker';
import { decideDnc, DNC_CONFIG } from '@/lib/dnc-decision';
import {
  classifyReply,
  consentEvents,
  consents,
  daysFromNow,
  dncAudit,
  getConsentState,
  hoursFromNow,
  normalizePhone,
  optinRequests,
  optouts,
  replyWindows,
} from '@/lib/consent';
import {
  applyDecision,
  DNC_TAG_NATIONAL,
  DNC_TAG_USHEALTH,
  fetchContact,
  notify,
  sendOptinMessage,
  TAG_OPTIN_CONFIRMED,
  TAG_REPLY_WINDOW,
  tagsForDncResult,
} from '@/lib/dnc-enforcement';
import type { ContactConsentState, DncChannel } from '@/types';

interface WebhookPayload {
  type: string;
  locationId: string;
  contactId?: string;
  id?: string; // ContactCreate uses 'id' instead of 'contactId'
  conversationId?: string;
  body?: string;
  direction?: string;
  messageType?: string;
  userId?: string;
  messageId?: string;
  status?: string;
  source?: string;
  dateAdded?: string;
  timestamp?: string;
  phone?: string; // ContactCreate includes phone directly
  email?: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
}

// Supported webhook event types
const SUPPORTED_EVENTS = ['OutboundMessage', 'ContactCreate', 'InboundMessage'];

function channelFromMessageType(messageType?: string): DncChannel | null {
  if (!messageType) return null;
  const t = messageType.toLowerCase();
  if (t.includes('sms')) return 'sms';
  if (t.includes('call') || t.includes('phone') || t.includes('voicemail')) return 'call';
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookData = req.body as WebhookPayload;

    // Only process supported event types
    if (!SUPPORTED_EVENTS.includes(webhookData.type)) {
      console.log('Ignoring unsupported webhook type:', webhookData.type);
      return res.status(200).json({ success: true, skipped: true });
    }

    // ContactCreate uses 'id' instead of 'contactId'
    const contactId = webhookData.contactId || webhookData.id;
    const { locationId } = webhookData;

    if (!locationId || !contactId) {
      console.error('Missing required fields:', { locationId, contactId });
      return res.status(400).json({ error: 'Missing locationId or contactId' });
    }

    console.log(`Processing ${webhookData.type} webhook:`, {
      locationId,
      contactId,
      messageType: webhookData.messageType,
    });

    // Step 1: Get installation from Supabase to find the access token
    const installations = await cadenceInstallations.getAll();
    const installation = installations.find(i => i.location_id === locationId && i.is_active);

    if (!installation) {
      console.error('No active installation found for location:', locationId);
      return res.status(200).json({ success: true, skipped: true, reason: 'no_installation' });
    }

    // Step 2: Get valid access token (handles refresh if needed)
    const accessToken = await getValidAccessToken(installation.user_id, locationId);

    if (!accessToken) {
      console.error('Could not get valid access token for:', { userId: installation.user_id, locationId });
      return res.status(200).json({ success: true, skipped: true, reason: 'no_token' });
    }

    const ghlApi = new GHLAPI(accessToken);

    if (webhookData.type === 'InboundMessage') {
      return handleInboundMessage(res, ghlApi, webhookData, locationId, contactId);
    }

    if (webhookData.type === 'OutboundMessage') {
      const handled = await handleOutboundReplyWindow(res, ghlApi, webhookData, locationId, contactId);
      if (handled) return;
    }

    // Standard DNC check path (ContactCreate + OutboundMessage)
    let phone: string | undefined;
    let existingTags: string[] = [];

    if (webhookData.type === 'ContactCreate' && webhookData.phone) {
      // ContactCreate includes phone directly, no need for extra API call
      phone = webhookData.phone;
      existingTags = webhookData.tags || [];
      console.log('Using phone from ContactCreate webhook:', { contactId, phone: `***${phone.slice(-4)}` });
    } else {
      const contact = await fetchContact(ghlApi, contactId);
      if (!contact) {
        return res.status(200).json({ success: true, skipped: true, reason: 'contact_fetch_failed' });
      }
      phone = contact.phone || undefined;
      existingTags = contact.tags;
    }

    if (!phone) {
      console.log('Contact has no phone number, skipping DNC check:', contactId);
      return res.status(200).json({ success: true, skipped: true, reason: 'no_phone' });
    }

    return handleStandardCheck(res, ghlApi, locationId, contactId, phone, existingTags);

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * OutboundMessage pre-check: consume an open reply window (the agent's one
 * custom message) and re-block immediately. Returns true if the event was
 * fully handled here (response already sent).
 */
async function handleOutboundReplyWindow(
  res: NextApiResponse,
  ghlApi: GHLAPI,
  webhookData: WebhookPayload,
  locationId: string,
  contactId: string
): Promise<boolean> {
  const messageId = webhookData.messageId;

  // Ignore our own opt-in sends (matched by message id, or by in-flight status
  // if the webhook outruns our DB write)
  if (messageId) {
    const ownRequest = await optinRequests.getBySentMessageId(locationId, messageId);
    if (ownRequest) {
      res.status(200).json({ success: true, skipped: true, reason: 'own_optin_message' });
      return true;
    }
  }
  if (await optinRequests.hasSending(locationId, contactId)) {
    res.status(200).json({ success: true, skipped: true, reason: 'own_optin_sending' });
    return true;
  }

  const window = await replyWindows.getOpen(locationId, contactId);
  if (!window) return false;

  // The agent's one message went out — close the window and re-block
  await replyWindows.markUsed(window.id, messageId);
  const phone = window.phone;
  const state = await getConsentState(locationId, contactId, phone);
  const dncResult = await checkDnc(phone);
  const decision = decideDnc(dncResult, state);

  await applyDecision(ghlApi, {
    locationId,
    contactId,
    phone,
    decision,
    removeTags: [TAG_REPLY_WINDOW],
  });
  await dncAudit.log({
    location_id: locationId,
    contact_id: contactId,
    phone,
    action: 'reply_window_used',
    reason: decision.reason,
    details: { window_id: window.id, message_id: messageId, channel: window.channel },
  });

  res.status(200).json({ success: true, replyWindow: 'used', reblocked: true });
  return true;
}

/**
 * InboundMessage: the contact reached out. Record the event, handle STOP/YES
 * keywords, and for blocked contacts run the opt-in + reply-window flow.
 */
async function handleInboundMessage(
  res: NextApiResponse,
  ghlApi: GHLAPI,
  webhookData: WebhookPayload,
  locationId: string,
  contactId: string
) {
  const channel = channelFromMessageType(webhookData.messageType);
  if (!channel) {
    return res.status(200).json({ success: true, skipped: true, reason: 'unsupported_channel' });
  }

  const contact = await fetchContact(ghlApi, contactId);
  if (!contact?.phone) {
    return res.status(200).json({ success: true, skipped: true, reason: 'no_phone' });
  }
  const phone = normalizePhone(contact.phone);
  const messageId = webhookData.messageId;
  const nowIso = new Date().toISOString();

  // Record the verified contact-initiated event (deduped by message id)
  const recorded = await consentEvents.record({
    location_id: locationId,
    contact_id: contactId,
    phone,
    event_type: channel === 'sms' ? 'inbound_sms' : 'inbound_call',
    ghl_message_id: messageId,
    conversation_id: webhookData.conversationId,
    occurred_at: webhookData.timestamp || nowIso,
  });
  if (recorded === 'duplicate') {
    return res.status(200).json({ success: true, skipped: true, reason: 'duplicate_event' });
  }

  const state = await getConsentState(locationId, contactId, phone);

  // Keyword handling (SMS only)
  if (channel === 'sms') {
    const classification = classifyReply(webhookData.body);

    if (classification === 'optout') {
      return handleOptout(res, ghlApi, locationId, contactId, phone, state, messageId, nowIso);
    }

    if (classification === 'affirmative') {
      if (state.pendingOptin && state.pendingOptin.status === 'pending') {
        return handleOptinConfirmation(res, ghlApi, locationId, contactId, phone, state, messageId, nowIso);
      }
      // YES with no pending request unlocks nothing — log and continue as a
      // regular inbound (which may trigger a fresh opt-in request below)
      await dncAudit.log({
        location_id: locationId,
        contact_id: contactId,
        phone,
        action: 'yes_without_pending',
        details: { message_id: messageId },
      });
    }
  }

  if (state.optedOut) {
    return res.status(200).json({ success: true, skipped: true, reason: 'opted_out' });
  }
  if (state.activeConsent) {
    return res.status(200).json({ success: true, consent: 'active' });
  }

  const dncResult = await checkDnc(phone);
  if (!dncResult.isBlacklist && !dncResult.isNationalDnc) {
    return res.status(200).json({ success: true, dnc: 'clean' });
  }

  // Blocked contact reached out. One open window at a time.
  if (state.openWindow) {
    return res.status(200).json({ success: true, replyWindow: 'already_open' });
  }

  const dncTags = tagsForDncResult(dncResult);

  // Opt-in already pending: each fresh inbound grants one more reply window,
  // up to the cap — strictly one-for-one, always contact-initiated
  if (state.pendingOptin) {
    const windowsUsed = await replyWindows.countForRequest(state.pendingOptin.id);
    if (windowsUsed >= DNC_CONFIG.replyWindowsMax) {
      await dncAudit.log({
        location_id: locationId,
        contact_id: contactId,
        phone,
        action: 'reply_window_max_reached',
        details: { optin_request_id: state.pendingOptin.id, max: DNC_CONFIG.replyWindowsMax },
      });
      return res.status(200).json({ success: true, skipped: true, reason: 'reply_windows_exhausted' });
    }

    const window = await replyWindows.open({
      location_id: locationId,
      contact_id: contactId,
      phone,
      optin_request_id: state.pendingOptin.id,
      channel,
      opened_by_message_id: messageId || `inbound-${nowIso}`,
      expires_at: hoursFromNow(DNC_CONFIG.replyWindowHours),
    });

    await applyDecision(ghlApi, {
      locationId,
      contactId,
      phone,
      decision: {
        smsBlocked: channel !== 'sms',
        callBlocked: channel !== 'call',
        reason: 'reply_window_open',
      },
      addTags: [...dncTags, TAG_REPLY_WINDOW],
    });
    await dncAudit.log({
      location_id: locationId,
      contact_id: contactId,
      phone,
      action: 'reply_window_opened',
      details: { window_id: window?.id, channel, optin_request_id: state.pendingOptin.id },
    });

    return res.status(200).json({ success: true, replyWindow: 'opened', channel });
  }

  // No pending request: send a fresh opt-in unless within cooldown
  const lastSentAt = await optinRequests.getLastSentAt(locationId, phone);
  if (lastSentAt) {
    const cooldownMs = DNC_CONFIG.optinCooldownDays * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(lastSentAt).getTime() < cooldownMs) {
      await dncAudit.log({
        location_id: locationId,
        contact_id: contactId,
        phone,
        action: 'optin_suppressed_cooldown',
        details: { last_sent_at: lastSentAt },
      });
      return res.status(200).json({ success: true, skipped: true, reason: 'optin_cooldown' });
    }
  }

  return sendOptinAndOpenWindow(
    res, ghlApi, locationId, contactId, phone, channel, dncResult, dncTags, messageId, nowIso
  );
}

async function sendOptinAndOpenWindow(
  res: NextApiResponse,
  ghlApi: GHLAPI,
  locationId: string,
  contactId: string,
  phone: string,
  channel: DncChannel,
  dncResult: { isBlacklist: boolean; isNationalDnc: boolean },
  dncTags: string[],
  messageId: string | undefined,
  nowIso: string
) {
  const trigger = dncResult.isBlacklist ? 'blacklist' : 'national';

  // 'sending' status marks the request in-flight so the OutboundMessage
  // webhook for our own opt-in message is ignored, not treated as the
  // agent's reply
  const request = await optinRequests.create({
    location_id: locationId,
    contact_id: contactId,
    phone,
    trigger,
    status: 'sending',
    expires_at: hoursFromNow(DNC_CONFIG.optinWindowHours),
  });
  if (!request) {
    return res.status(200).json({ success: false, error: 'optin_request_create_failed' });
  }

  // SMS must be open to deliver the opt-in text; the contact's channel stays
  // open for the agent's reply window
  await applyDecision(ghlApi, {
    locationId,
    contactId,
    phone,
    decision: {
      smsBlocked: false,
      callBlocked: channel !== 'call',
      reason: 'optin_sending',
    },
    addTags: dncTags,
  });

  const sent = await sendOptinMessage(ghlApi, locationId, contactId);

  if (!sent) {
    // Never leave the contact open after a failed send
    await optinRequests.update(request.id, { status: 'failed' });
    await applyDecision(ghlApi, {
      locationId,
      contactId,
      phone,
      decision: {
        smsBlocked: true,
        callBlocked: true,
        reason: trigger === 'blacklist' ? 'company_blacklist' : 'national_dnc',
      },
      removeTags: [TAG_REPLY_WINDOW],
    });
    await dncAudit.log({
      location_id: locationId,
      contact_id: contactId,
      phone,
      action: 'optin_send_failed',
      details: { optin_request_id: request.id },
    });
    return res.status(200).json({ success: false, optin: 'send_failed' });
  }

  await optinRequests.update(request.id, {
    status: 'pending',
    sent_message_id: sent.messageId,
    sent_at: new Date().toISOString(),
  });

  const window = await replyWindows.open({
    location_id: locationId,
    contact_id: contactId,
    phone,
    optin_request_id: request.id,
    channel,
    opened_by_message_id: messageId || `inbound-${nowIso}`,
    expires_at: hoursFromNow(DNC_CONFIG.replyWindowHours),
  });

  // Narrow DND to just the contact's channel now that the opt-in is delivered
  await applyDecision(ghlApi, {
    locationId,
    contactId,
    phone,
    decision: {
      smsBlocked: channel !== 'sms',
      callBlocked: channel !== 'call',
      reason: 'reply_window_open',
    },
    addTags: [TAG_REPLY_WINDOW],
  });

  await dncAudit.log({
    location_id: locationId,
    contact_id: contactId,
    phone,
    action: 'optin_sent',
    reason: trigger,
    details: { optin_request_id: request.id, sent_message_id: sent.messageId, window_id: window?.id, channel },
  });

  if (trigger === 'blacklist') {
    await notify('blacklist_inbound', { locationId, contactId, phone: `***${phone.slice(-4)}` });
  }

  return res.status(200).json({ success: true, optin: 'sent', replyWindow: 'opened', channel });
}

async function handleOptout(
  res: NextApiResponse,
  ghlApi: GHLAPI,
  locationId: string,
  contactId: string,
  phone: string,
  state: ContactConsentState,
  messageId: string | undefined,
  nowIso: string
) {
  await optouts.record({
    location_id: locationId,
    contact_id: contactId,
    phone,
    source: 'stop_keyword',
    ghl_message_id: messageId,
    occurred_at: nowIso,
  });
  await consents.revokeAllForPhone(locationId, phone, 'stop_keyword');
  if (state.openWindow) {
    await replyWindows.close(state.openWindow.id, 'closed');
  }
  if (state.pendingOptin) {
    await optinRequests.update(state.pendingOptin.id, {
      status: 'denied',
      response_message_id: messageId || null,
      responded_at: nowIso,
    });
  }

  await applyDecision(ghlApi, {
    locationId,
    contactId,
    phone,
    decision: { smsBlocked: true, callBlocked: true, reason: 'opted_out' },
    removeTags: [TAG_REPLY_WINDOW, TAG_OPTIN_CONFIRMED],
  });
  await dncAudit.log({
    location_id: locationId,
    contact_id: contactId,
    phone,
    action: 'optout_recorded',
    details: { message_id: messageId },
  });

  return res.status(200).json({ success: true, optout: 'recorded' });
}

async function handleOptinConfirmation(
  res: NextApiResponse,
  ghlApi: GHLAPI,
  locationId: string,
  contactId: string,
  phone: string,
  state: ContactConsentState,
  messageId: string | undefined,
  nowIso: string
) {
  const request = state.pendingOptin!;

  // Blacklist hits can require a human decision before unlocking
  if (request.trigger === 'blacklist' && DNC_CONFIG.blacklistOptinMode === 'review') {
    await optinRequests.update(request.id, {
      status: 'awaiting_review',
      response_message_id: messageId || null,
      responded_at: nowIso,
    });
    await dncAudit.log({
      location_id: locationId,
      contact_id: contactId,
      phone,
      action: 'blacklist_review_queued',
      details: { optin_request_id: request.id, message_id: messageId },
    });
    await notify('blacklist_optin_awaiting_review', {
      locationId,
      contactId,
      phone: `***${phone.slice(-4)}`,
      optinRequestId: request.id,
    });
    return res.status(200).json({ success: true, optin: 'awaiting_review' });
  }

  await optinRequests.update(request.id, {
    status: 'confirmed',
    response_message_id: messageId || null,
    responded_at: nowIso,
  });
  const consent = await consents.create({
    location_id: locationId,
    contact_id: contactId,
    phone,
    source: 'optin_yes',
    optin_request_id: request.id,
    granted_at: nowIso,
    expires_at: daysFromNow(DNC_CONFIG.consentDurationDays),
  });
  await consentEvents.record({
    location_id: locationId,
    contact_id: contactId,
    phone,
    event_type: 'optin_confirmed',
    ghl_message_id: messageId ? `optin-confirm-${messageId}` : undefined,
    occurred_at: nowIso,
  });
  if (state.openWindow) {
    await replyWindows.close(state.openWindow.id, 'closed');
  }

  await applyDecision(ghlApi, {
    locationId,
    contactId,
    phone,
    decision: { smsBlocked: false, callBlocked: false, reason: 'consent_active' },
    addTags: [TAG_OPTIN_CONFIRMED],
    removeTags: [TAG_REPLY_WINDOW],
  });
  await dncAudit.log({
    location_id: locationId,
    contact_id: contactId,
    phone,
    action: 'optin_confirmed',
    reason: request.trigger,
    details: { optin_request_id: request.id, consent_id: consent?.id, message_id: messageId },
  });

  if (request.trigger === 'blacklist') {
    await notify('blacklist_optin_confirmed', {
      locationId,
      contactId,
      phone: `***${phone.slice(-4)}`,
    });
  }

  return res.status(200).json({ success: true, optin: 'confirmed' });
}

/**
 * Standard DNC check (ContactCreate + OutboundMessage): recompute desired
 * state from list status + consent facts and apply it. Consent and open
 * windows outrank a cached "on list" result, so a consented contact is never
 * re-blocked here.
 */
async function handleStandardCheck(
  res: NextApiResponse,
  ghlApi: GHLAPI,
  locationId: string,
  contactId: string,
  rawPhone: string,
  existingTags: string[]
) {
  const phone = normalizePhone(rawPhone);
  const state = await getConsentState(locationId, contactId, phone);

  if (state.activeConsent) {
    return res.status(200).json({ success: true, skipped: true, reason: 'consent_active' });
  }
  if (state.optedOut) {
    await applyDecision(ghlApi, {
      locationId,
      contactId,
      phone,
      decision: { smsBlocked: true, callBlocked: true, reason: 'opted_out' },
    });
    return res.status(200).json({ success: true, reason: 'opted_out' });
  }

  // Already fully tagged and no window in play: nothing to do
  const alreadyTagged = existingTags.includes(DNC_TAG_USHEALTH) && existingTags.includes(DNC_TAG_NATIONAL);
  if (alreadyTagged && !state.openWindow) {
    console.log(JSON.stringify({
      event: 'dnc_check',
      phone: `***${phone.slice(-4)}`,
      cache_status: 'skipped_tagged',
      blacklist_cached: false,
      national_cached: false,
      result: { is_blacklist: true, is_national_dnc: true },
      duration_ms: 0
    }));
    return res.status(200).json({
      success: true,
      skipped: true,
      reason: 'already_tagged',
      tags: [DNC_TAG_USHEALTH, DNC_TAG_NATIONAL]
    });
  }

  const dncResult = await checkDnc(phone);
  const isOnAnyList = dncResult.isBlacklist || dncResult.isNationalDnc;

  if (isOnAnyList) {
    const decision = decideDnc(dncResult, state);
    const addTags = [
      ...tagsForDncResult(dncResult),
      ...(state.openWindow ? [TAG_REPLY_WINDOW] : []),
    ];

    const updated = await applyDecision(ghlApi, { locationId, contactId, phone, decision, addTags });

    if (decision.reason !== 'reply_window_open') {
      await dncAudit.log({
        location_id: locationId,
        contact_id: contactId,
        phone,
        action: 'blocked',
        reason: decision.reason,
        details: { tags: addTags },
      });
    }

    return res.status(200).json({
      success: true,
      dncCheck: {
        contactId,
        isOnDNC: true,
        internal: dncResult.isBlacklist,
        national: dncResult.isNationalDnc,
        decision: decision.reason,
        tags: addTags,
        contactUpdated: updated,
        fromCache: {
          blacklist: dncResult.blacklistFromCache,
          national: dncResult.nationalFromCache
        }
      }
    });
  }

  // Not on any list
  console.log('Contact is clean, no DNC flags:', contactId);
  return res.status(200).json({
    success: true,
    dncCheck: {
      contactId,
      isOnDNC: false,
      internal: false,
      national: false,
      fromCache: {
        blacklist: dncResult.blacklistFromCache,
        national: dncResult.nationalFromCache
      }
    }
  });
}
