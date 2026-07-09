import type { NextApiRequest, NextApiResponse } from 'next';
import { cadenceInstallations } from '@/lib/supabase';
import { getValidAccessToken } from '@/lib/token-manager';
import { GHLAPI } from '@/lib/ghl-api';
import { checkDnc } from '@/lib/dnc-checker';
import { decideDnc } from '@/lib/dnc-decision';
import {
  consents,
  dncAudit,
  getConsentState,
  optinRequests,
  replyWindows,
} from '@/lib/consent';
import { applyDecision, TAG_OPTIN_CONFIRMED, TAG_REPLY_WINDOW } from '@/lib/dnc-enforcement';

/**
 * Reconcile cron (hourly): the enforcement teeth of the consent system.
 * - Expires pending opt-in requests past their YES deadline
 * - Expires open reply windows the agent never used, re-blocking the contact
 * - Expires lapsed consents (default 90 days), re-blocking if still on a list
 *
 * Every re-block recomputes desired state through the decision engine, so a
 * contact who dropped off the DNC lists in the meantime is not re-blocked.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '');

  if (cronSecret !== process.env.CRON_SECRET) {
    console.error('Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const nowIso = new Date().toISOString();
    const apiCache = new Map<string, GHLAPI | null>();

    async function apiForLocation(locationId: string): Promise<GHLAPI | null> {
      if (apiCache.has(locationId)) return apiCache.get(locationId) || null;
      const installation = await cadenceInstallations.getByLocation(locationId);
      let api: GHLAPI | null = null;
      if (installation) {
        const token = await getValidAccessToken(installation.user_id, locationId);
        if (token) api = new GHLAPI(token);
      }
      apiCache.set(locationId, api);
      return api;
    }

    // 1. Expire pending opt-in requests past their deadline
    const expiredOptins = await optinRequests.expirePending(nowIso);
    for (const request of expiredOptins) {
      await dncAudit.log({
        location_id: request.location_id,
        contact_id: request.contact_id,
        phone: request.phone,
        action: 'optin_expired',
        details: { optin_request_id: request.id },
      });
    }

    // 2. Expire unused reply windows and re-block
    const expiredWindows = await replyWindows.getExpiredOpen(nowIso);
    let windowsReblocked = 0;
    for (const window of expiredWindows) {
      await replyWindows.close(window.id, 'expired');

      const ghlApi = await apiForLocation(window.location_id);
      if (!ghlApi) continue;

      const state = await getConsentState(window.location_id, window.contact_id, window.phone);
      const dncResult = await checkDnc(window.phone);
      const decision = decideDnc(dncResult, state);

      const applied = await applyDecision(ghlApi, {
        locationId: window.location_id,
        contactId: window.contact_id,
        phone: window.phone,
        decision,
        removeTags: [TAG_REPLY_WINDOW],
      });
      if (applied) windowsReblocked++;

      await dncAudit.log({
        location_id: window.location_id,
        contact_id: window.contact_id,
        phone: window.phone,
        action: 'reply_window_expired',
        reason: decision.reason,
        details: { window_id: window.id },
      });
    }

    // 3. Expire lapsed consents and re-block if still listed
    const expiredConsents = await consents.getExpired(nowIso);
    let consentsReblocked = 0;
    for (const consent of expiredConsents) {
      await consents.revoke(consent.id, 'expired');

      const ghlApi = await apiForLocation(consent.location_id);
      if (!ghlApi) continue;

      const state = await getConsentState(consent.location_id, consent.contact_id, consent.phone);
      const dncResult = await checkDnc(consent.phone);
      const decision = decideDnc(dncResult, state);

      const applied = await applyDecision(ghlApi, {
        locationId: consent.location_id,
        contactId: consent.contact_id,
        phone: consent.phone,
        decision,
        removeTags: [TAG_OPTIN_CONFIRMED],
      });
      if (applied) consentsReblocked++;

      await dncAudit.log({
        location_id: consent.location_id,
        contact_id: consent.contact_id,
        phone: consent.phone,
        action: 'consent_expired',
        reason: decision.reason,
        details: { consent_id: consent.id },
      });
    }

    const summary = {
      success: true,
      optinsExpired: expiredOptins.length,
      windowsExpired: expiredWindows.length,
      windowsReblocked,
      consentsExpired: expiredConsents.length,
      consentsReblocked,
    };
    console.log('DNC reconcile complete:', summary);
    return res.status(200).json(summary);
  } catch (error) {
    console.error('DNC reconcile error:', error);
    return res.status(500).json({ error: 'Reconcile failed' });
  }
}
