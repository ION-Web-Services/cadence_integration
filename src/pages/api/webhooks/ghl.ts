import type { NextApiRequest, NextApiResponse } from 'next';
import { cadenceInstallations } from '@/lib/supabase';
import { getValidAccessToken } from '@/lib/token-manager';
import { GHLAPI } from '@/lib/ghl-api';

const DNC_API_KEY = 'A542CEF7-898E-43E9-A2C3-18648BAE1A84';
const DNC_API_BASE = 'https://leads-dnc-api.ushealthgroup.com';

interface WebhookPayload {
  type: string;
  locationId: string;
  contactId: string;
  conversationId: string;
  body: string;
  direction: string;
  messageType: string;
  userId: string;
  messageId: string;
  status: string;
  source: string;
  dateAdded: string;
  timestamp: string;
}

interface DNCResult {
  isOnList: boolean;
  source: 'internal' | 'national';
  details?: unknown;
}

// Check internal company blacklist
async function checkInternalBlacklist(phone: string): Promise<DNCResult> {
  try {
    const response = await fetch(
      `${DNC_API_BASE}/api/Blacklist/IsOnCompanyBlackList?phone=${encodeURIComponent(phone)}`,
      {
        headers: { 'X-Api-Key': DNC_API_KEY }
      }
    );
    const data = await response.json();
    // API returns { isOnCompanyBlacklist: true/false }
    const isOnList = data?.isOnCompanyBlacklist === true;
    return {
      isOnList,
      source: 'internal',
      details: data
    };
  } catch (error) {
    console.error('Internal blacklist check failed:', error);
    return { isOnList: false, source: 'internal', details: { error: String(error) } };
  }
}

// Check national DNC list
async function checkNationalDNC(phone: string): Promise<DNCResult> {
  try {
    const response = await fetch(
      `${DNC_API_BASE}/v2/DoNotCall/IsDoNotCall?phone=${encodeURIComponent(phone)}`,
      {
        headers: { 'X-Api-Key': DNC_API_KEY }
      }
    );
    const data = await response.json();
    // API returns { contactStatus: { canContact: false, reason: "Federal DNC" } }
    const isOnList = data?.contactStatus?.canContact === false;
    return {
      isOnList,
      source: 'national',
      details: data
    };
  } catch (error) {
    console.error('National DNC check failed:', error);
    return { isOnList: false, source: 'national', details: { error: String(error) } };
  }
}

// Update contact in GHL: set DNC and/or add tags
async function updateContactDNC(
  ghlApi: GHLAPI,
  contactId: string,
  tags: string[]
): Promise<boolean> {
  try {
    const response = await ghlApi.makeRequest({
      method: 'PUT',
      endpoint: `/contacts/${contactId}`,
      data: {
        dnd: true,
        dndSettings: {
          SMS: { status: 'active', message: 'DNC - Do Not Contact' },
          Call: { status: 'active', message: 'DNC - Do Not Contact' }
        },
        tags: tags
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to update contact DNC status:', {
        status: response.status,
        error: errorText,
        contactId
      });
      return false;
    }

    console.log('Contact DNC status updated successfully:', { contactId, tags });
    return true;
  } catch (error) {
    console.error('Error updating contact DNC status:', error);
    return false;
  }
}

// Tag contact without setting DNC (for flagging only)
async function tagContact(
  ghlApi: GHLAPI,
  contactId: string,
  tags: string[]
): Promise<boolean> {
  try {
    const response = await ghlApi.makeRequest({
      method: 'PUT',
      endpoint: `/contacts/${contactId}`,
      data: { tags }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to tag contact:', {
        status: response.status,
        error: errorText,
        contactId
      });
      return false;
    }

    console.log('Contact tagged successfully:', { contactId, tags });
    return true;
  } catch (error) {
    console.error('Error tagging contact:', error);
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const webhookData = req.body as WebhookPayload;

    // Only process OutboundMessage events
    if (webhookData.type !== 'OutboundMessage') {
      console.log('Ignoring non-OutboundMessage webhook:', webhookData.type);
      return res.status(200).json({ success: true, skipped: true });
    }

    const { locationId, contactId, userId } = webhookData;

    if (!locationId || !contactId) {
      console.error('Missing required fields:', { locationId, contactId });
      return res.status(400).json({ error: 'Missing locationId or contactId' });
    }

    console.log('Processing OutboundMessage DNC check:', {
      locationId,
      contactId,
      userId,
      messageType: webhookData.messageType
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

    // Step 3: Get contact details from GHL to get phone number
    const ghlApi = new GHLAPI(accessToken);
    const contactResponse = await ghlApi.makeRequest({
      method: 'GET',
      endpoint: `/contacts/${contactId}`
    });

    if (!contactResponse.ok) {
      console.error('Failed to fetch contact:', { contactId, status: contactResponse.status });
      return res.status(200).json({ success: true, skipped: true, reason: 'contact_fetch_failed' });
    }

    const contactData = await contactResponse.json();
    const phone = contactData.contact?.phone;

    if (!phone) {
      console.log('Contact has no phone number, skipping DNC check:', contactId);
      return res.status(200).json({ success: true, skipped: true, reason: 'no_phone' });
    }

    console.log('Checking DNC for phone:', { contactId, phone: phone.slice(-4) });

    // Step 4: Check both DNC lists in parallel
    const [internalResult, nationalResult] = await Promise.all([
      checkInternalBlacklist(phone),
      checkNationalDNC(phone)
    ]);

    const isOnInternalList = internalResult.isOnList;
    const isOnNationalList = nationalResult.isOnList;
    const isOnAnyList = isOnInternalList || isOnNationalList;

    console.log('DNC check results:', {
      contactId,
      phone: phone.slice(-4),
      internal: isOnInternalList,
      national: isOnNationalList
    });

    // Step 5: If on any DNC list, update the contact in GHL
    if (isOnAnyList) {
      const tags: string[] = [];
      if (isOnInternalList) tags.push('DNC-Internal');
      if (isOnNationalList) tags.push('DNC-National');
      tags.push('DNC-Flagged');

      console.log('Contact is on DNC list, updating:', { contactId, tags });

      const updated = await updateContactDNC(ghlApi, contactId, tags);

      return res.status(200).json({
        success: true,
        dncCheck: {
          contactId,
          isOnDNC: true,
          internal: isOnInternalList,
          national: isOnNationalList,
          tags,
          contactUpdated: updated
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
        national: false
      }
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
