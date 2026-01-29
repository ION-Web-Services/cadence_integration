import type { NextApiRequest, NextApiResponse } from 'next';
import { cadenceInstallations } from '@/lib/supabase';
import { getValidAccessToken } from '@/lib/token-manager';
import { GHLAPI } from '@/lib/ghl-api';
import { checkDnc } from '@/lib/dnc-checker';

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
const SUPPORTED_EVENTS = ['OutboundMessage', 'ContactCreate'];

// DNC tags used for flagging contacts
const DNC_TAG_USHEALTH = 'DNC-USHEALTH';
const DNC_TAG_NATIONAL = 'DNC-NATIONAL';

// Get existing tags from a contact
async function getExistingTags(ghlApi: GHLAPI, contactId: string): Promise<string[]> {
  try {
    const response = await ghlApi.makeRequest({
      method: 'GET',
      endpoint: `/contacts/${contactId}`
    });

    if (!response.ok) {
      console.error('Failed to fetch contact for existing tags:', { contactId, status: response.status });
      return [];
    }

    const data = await response.json();
    return data.contact?.tags || [];
  } catch (error) {
    console.error('Error fetching existing tags:', error);
    return [];
  }
}

// Update contact in GHL: set DND and append DNC tags (preserving existing tags)
async function updateContactDNC(
  ghlApi: GHLAPI,
  contactId: string,
  newTags: string[]
): Promise<boolean> {
  try {
    // Fetch existing tags so we don't overwrite them
    const existingTags = await getExistingTags(ghlApi, contactId);
    const mergedTags = [...new Set([...existingTags, ...newTags])];

    console.log('Merging tags:', { existingTags, newTags, mergedTags });

    const response = await ghlApi.makeRequest({
      method: 'PUT',
      endpoint: `/contacts/${contactId}`,
      data: {
        dnd: true,
        dndSettings: {
          SMS: { status: 'active', message: 'DNC - Do Not Contact' },
          Call: { status: 'active', message: 'DNC - Do Not Contact' }
        },
        tags: mergedTags
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

    console.log('Contact DNC status updated successfully:', { contactId, tags: mergedTags });
    return true;
  } catch (error) {
    console.error('Error updating contact DNC status:', error);
    return false;
  }
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
    const { locationId, userId } = webhookData;

    if (!locationId || !contactId) {
      console.error('Missing required fields:', { locationId, contactId });
      return res.status(400).json({ error: 'Missing locationId or contactId' });
    }

    console.log(`Processing ${webhookData.type} DNC check:`, {
      locationId,
      contactId,
      userId,
      eventType: webhookData.type,
      ...(webhookData.type === 'OutboundMessage' ? { messageType: webhookData.messageType } : {})
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

    // Step 3: Get contact details - ContactCreate includes phone directly, others need API call
    const ghlApi = new GHLAPI(accessToken);
    let phone: string | undefined;
    let existingTags: string[] = [];

    if (webhookData.type === 'ContactCreate' && webhookData.phone) {
      // ContactCreate includes phone directly, no need for extra API call
      phone = webhookData.phone;
      existingTags = webhookData.tags || [];
      console.log('Using phone from ContactCreate webhook:', { contactId, phone: `***${phone.slice(-4)}` });
    } else {
      // Fetch contact details from GHL
      const contactResponse = await ghlApi.makeRequest({
        method: 'GET',
        endpoint: `/contacts/${contactId}`
      });

      if (!contactResponse.ok) {
        console.error('Failed to fetch contact:', { contactId, status: contactResponse.status });
        return res.status(200).json({ success: true, skipped: true, reason: 'contact_fetch_failed' });
      }

      const contactData = await contactResponse.json();
      phone = contactData.contact?.phone;
      existingTags = contactData.contact?.tags || [];
    }

    if (!phone) {
      console.log('Contact has no phone number, skipping DNC check:', contactId);
      return res.status(200).json({ success: true, skipped: true, reason: 'no_phone' });
    }

    // Step 4: Check if contact already has DNC tags - skip if already flagged
    const alreadyTaggedUshealth = existingTags.includes(DNC_TAG_USHEALTH);
    const alreadyTaggedNational = existingTags.includes(DNC_TAG_NATIONAL);
    
    if (alreadyTaggedUshealth && alreadyTaggedNational) {
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

    // Step 5: Check DNC with caching
    const dncResult = await checkDnc(phone);

    const isOnAnyList = dncResult.isBlacklist || dncResult.isNationalDnc;

    // Step 6: If on any DNC list, update the contact in GHL
    if (isOnAnyList) {
      const tags: string[] = [];
      if (dncResult.isBlacklist) tags.push(DNC_TAG_USHEALTH);
      if (dncResult.isNationalDnc) tags.push(DNC_TAG_NATIONAL);

      console.log('Contact is on DNC list, updating:', { contactId, tags });

      const updated = await updateContactDNC(ghlApi, contactId, tags);

      return res.status(200).json({
        success: true,
        dncCheck: {
          contactId,
          isOnDNC: true,
          internal: dncResult.isBlacklist,
          national: dncResult.isNationalDnc,
          tags,
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

  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
