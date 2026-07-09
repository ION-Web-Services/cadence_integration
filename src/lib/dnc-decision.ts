/**
 * DNC Decision Engine
 *
 * Single source of truth for whether a contact may be contacted, computed from
 * stored facts (list status, consents, opt-outs, reply windows). Every webhook
 * and cron recomputes desired state through this function, so event ordering
 * never matters. Tags are outputs for visibility only — never inputs.
 */

import type { ContactConsentState, DncDecision } from '@/types';

// Configuration from environment variables
export const DNC_CONFIG = {
  // How long a YES reply is awaited after sending the opt-in request
  optinWindowHours: parseInt(process.env.OPTIN_WINDOW_HOURS || '48', 10),
  // How long the agent has to send their one custom reply
  replyWindowHours: parseInt(process.env.REPLY_WINDOW_HOURS || '24', 10),
  // Max one-for-one reply windows per opt-in request before YES is required
  replyWindowsMax: parseInt(process.env.REPLY_WINDOWS_MAX || '5', 10),
  // Min days between opt-in requests per contact
  optinCooldownDays: parseInt(process.env.OPTIN_COOLDOWN_DAYS || '30', 10),
  // How long a YES unlock lasts
  consentDurationDays: parseInt(process.env.CONSENT_DURATION_DAYS || '90', 10),
  // 'review': YES from a blacklisted contact queues for admin approval
  // 'auto': YES unlocks immediately + notifies
  blacklistOptinMode: (process.env.BLACKLIST_OPTIN_MODE || 'review') as 'review' | 'auto',
};

export function decideDnc(
  dnc: { isBlacklist: boolean; isNationalDnc: boolean },
  state: ContactConsentState
): DncDecision {
  // 1. Opt-out overrides everything, permanently
  if (state.optedOut) {
    return { smsBlocked: true, callBlocked: true, reason: 'opted_out' };
  }

  // 2. Documented express consent (YES) opens both channels
  if (state.activeConsent) {
    return { smsBlocked: false, callBlocked: false, reason: 'consent_active' };
  }

  // 3. Not on any list: nothing to block
  if (!dnc.isBlacklist && !dnc.isNationalDnc) {
    return { smsBlocked: false, callBlocked: false, reason: 'clean' };
  }

  // 4. Open reply window: only the channel the contact used is open
  if (state.openWindow) {
    return {
      smsBlocked: state.openWindow.channel !== 'sms',
      callBlocked: state.openWindow.channel !== 'call',
      reason: 'reply_window_open',
    };
  }

  // 5. On a list with no consent: blocked
  return {
    smsBlocked: true,
    callBlocked: true,
    reason: dnc.isBlacklist ? 'company_blacklist' : 'national_dnc',
  };
}
