/**
 * Consent, opt-in, opt-out, reply-window and audit database operations.
 *
 * These tables are the system's own record of contact-initiated events —
 * agents cannot write to them, so nothing an agent does in GHL can create
 * consent. All access goes through the service role client.
 */

import { supabaseAdmin } from './supabase';
import type {
  ConsentGrant,
  ContactConsentState,
  DncChannel,
  OptinRequest,
  ReplyWindow,
} from '@/types';

export const CONSENT_EVENTS_TABLE = 'cadence_consent_events';
export const OPTIN_REQUESTS_TABLE = 'cadence_optin_requests';
export const CONSENTS_TABLE = 'cadence_consents';
export const REPLY_WINDOWS_TABLE = 'cadence_reply_windows';
export const OPTOUTS_TABLE = 'cadence_optouts';
export const CONTACT_DNC_STATE_TABLE = 'cadence_contact_dnc_state';
export const DNC_AUDIT_TABLE = 'cadence_dnc_audit';

// --- Time helpers ---

export function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// Normalize to E.164 so consent/opt-out records match regardless of formatting
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

// --- Reply classification (strict, small keyword sets) ---

const AFFIRMATIVE_KEYWORDS = new Set(['yes', 'y', 'yeah', 'yep', 'yea', 'confirm']);
// CTIA standard opt-out keywords
const OPTOUT_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);

export function classifyReply(body?: string): 'affirmative' | 'optout' | 'other' {
  if (!body) return 'other';
  const firstWord = body.trim().toLowerCase().replace(/[^a-z\s]/g, ' ').trim().split(/\s+/)[0] || '';
  if (OPTOUT_KEYWORDS.has(firstWord)) return 'optout';
  if (AFFIRMATIVE_KEYWORDS.has(firstWord)) return 'affirmative';
  return 'other';
}

// --- Consent events (immutable evidence, deduped by GHL message id) ---

export const consentEvents = {
  async record(event: {
    location_id: string;
    contact_id: string;
    phone: string;
    event_type: 'inbound_sms' | 'inbound_call' | 'optin_confirmed';
    ghl_message_id?: string;
    conversation_id?: string;
    occurred_at: string;
  }): Promise<'recorded' | 'duplicate' | 'error'> {
    try {
      const { error } = await supabaseAdmin.from(CONSENT_EVENTS_TABLE).insert(event);
      if (error) {
        if (error.code === '23505') return 'duplicate'; // unique_violation on ghl_message_id
        console.error('Error recording consent event:', error);
        return 'error';
      }
      return 'recorded';
    } catch (error) {
      console.error('Error recording consent event:', error);
      return 'error';
    }
  },
};

// --- Opt-in requests ---

export const optinRequests = {
  async getPending(locationId: string, contactId: string): Promise<OptinRequest | null> {
    const { data, error } = await supabaseAdmin
      .from(OPTIN_REQUESTS_TABLE)
      .select('*')
      .eq('location_id', locationId)
      .eq('contact_id', contactId)
      .in('status', ['pending', 'sending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching pending opt-in request:', error);
      return null;
    }
    return data;
  },

  async getBySentMessageId(locationId: string, messageId: string): Promise<OptinRequest | null> {
    const { data, error } = await supabaseAdmin
      .from(OPTIN_REQUESTS_TABLE)
      .select('*')
      .eq('location_id', locationId)
      .eq('sent_message_id', messageId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching opt-in request by message id:', error);
      return null;
    }
    return data;
  },

  // True while our own opt-in send is in flight (used to ignore its OutboundMessage webhook)
  async hasSending(locationId: string, contactId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from(OPTIN_REQUESTS_TABLE)
      .select('id')
      .eq('location_id', locationId)
      .eq('contact_id', contactId)
      .eq('status', 'sending')
      .limit(1);

    if (error) {
      console.error('Error checking sending opt-in request:', error);
      return false;
    }
    return (data?.length || 0) > 0;
  },

  // Most recent actually-sent request for cooldown checks (failed sends don't count)
  async getLastSentAt(locationId: string, phone: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from(OPTIN_REQUESTS_TABLE)
      .select('sent_at')
      .eq('location_id', locationId)
      .eq('phone', phone)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching last opt-in sent time:', error);
      return null;
    }
    return data?.sent_at || null;
  },

  async create(request: {
    location_id: string;
    contact_id: string;
    phone: string;
    trigger: 'national' | 'blacklist';
    status: string;
    expires_at: string;
  }): Promise<OptinRequest | null> {
    const { data, error } = await supabaseAdmin
      .from(OPTIN_REQUESTS_TABLE)
      .insert(request)
      .select()
      .single();

    if (error) {
      console.error('Error creating opt-in request:', error);
      return null;
    }
    return data;
  },

  async update(id: string, fields: Partial<OptinRequest>): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from(OPTIN_REQUESTS_TABLE)
      .update(fields)
      .eq('id', id);

    if (error) {
      console.error('Error updating opt-in request:', error);
      return false;
    }
    return true;
  },

  // Expire pending requests past their deadline; returns the expired rows
  async expirePending(nowIso: string): Promise<OptinRequest[]> {
    const { data, error } = await supabaseAdmin
      .from(OPTIN_REQUESTS_TABLE)
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', nowIso)
      .select();

    if (error) {
      console.error('Error expiring opt-in requests:', error);
      return [];
    }
    return data || [];
  },
};

// --- Consent grants ---

export const consents = {
  async getActive(locationId: string, phone: string): Promise<ConsentGrant | null> {
    const { data, error } = await supabaseAdmin
      .from(CONSENTS_TABLE)
      .select('*')
      .eq('location_id', locationId)
      .eq('phone', phone)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching active consent:', error);
      return null;
    }
    return data;
  },

  async create(consent: {
    location_id: string;
    contact_id: string;
    phone: string;
    source: 'optin_yes' | 'admin_approved';
    optin_request_id?: string;
    granted_at: string;
    expires_at: string;
  }): Promise<ConsentGrant | null> {
    const { data, error } = await supabaseAdmin
      .from(CONSENTS_TABLE)
      .insert(consent)
      .select()
      .single();

    if (error) {
      console.error('Error creating consent:', error);
      return null;
    }
    return data;
  },

  async revokeAllForPhone(locationId: string, phone: string, reason: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from(CONSENTS_TABLE)
      .update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
      .eq('location_id', locationId)
      .eq('phone', phone)
      .is('revoked_at', null);

    if (error) {
      console.error('Error revoking consents:', error);
      return false;
    }
    return true;
  },

  async revoke(id: string, reason: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from(CONSENTS_TABLE)
      .update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
      .eq('id', id);

    if (error) {
      console.error('Error revoking consent:', error);
      return false;
    }
    return true;
  },

  // Unrevoked consents past their expiry (for the reconcile cron)
  async getExpired(nowIso: string): Promise<ConsentGrant[]> {
    const { data, error } = await supabaseAdmin
      .from(CONSENTS_TABLE)
      .select('*')
      .is('revoked_at', null)
      .lt('expires_at', nowIso);

    if (error) {
      console.error('Error fetching expired consents:', error);
      return [];
    }
    return data || [];
  },
};

// --- Opt-outs ---

export const optouts = {
  async get(locationId: string, phone: string): Promise<{ id: string } | null> {
    const { data, error } = await supabaseAdmin
      .from(OPTOUTS_TABLE)
      .select('id')
      .eq('location_id', locationId)
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.error('Error fetching opt-out:', error);
      return null;
    }
    return data;
  },

  async record(optout: {
    location_id: string;
    contact_id?: string;
    phone: string;
    source: 'stop_keyword' | 'manual';
    ghl_message_id?: string;
    occurred_at: string;
  }): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from(OPTOUTS_TABLE)
      .upsert(optout, { onConflict: 'location_id,phone', ignoreDuplicates: true });

    if (error) {
      console.error('Error recording opt-out:', error);
      return false;
    }
    return true;
  },
};

// --- Reply windows ---

export const replyWindows = {
  async getOpen(locationId: string, contactId: string): Promise<ReplyWindow | null> {
    const { data, error } = await supabaseAdmin
      .from(REPLY_WINDOWS_TABLE)
      .select('*')
      .eq('location_id', locationId)
      .eq('contact_id', contactId)
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching open reply window:', error);
      return null;
    }
    return data;
  },

  async open(window: {
    location_id: string;
    contact_id: string;
    phone: string;
    optin_request_id?: string;
    channel: DncChannel;
    opened_by_message_id: string;
    expires_at: string;
  }): Promise<ReplyWindow | null> {
    const { data, error } = await supabaseAdmin
      .from(REPLY_WINDOWS_TABLE)
      .insert(window)
      .select()
      .single();

    if (error) {
      console.error('Error opening reply window:', error);
      return null;
    }
    return data;
  },

  async markUsed(id: string, usedByMessageId?: string): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from(REPLY_WINDOWS_TABLE)
      .update({ status: 'used', used_by_message_id: usedByMessageId || null })
      .eq('id', id);

    if (error) {
      console.error('Error marking reply window used:', error);
      return false;
    }
    return true;
  },

  async close(id: string, status: 'closed' | 'expired'): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from(REPLY_WINDOWS_TABLE)
      .update({ status })
      .eq('id', id);

    if (error) {
      console.error('Error closing reply window:', error);
      return false;
    }
    return true;
  },

  async countForRequest(optinRequestId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from(REPLY_WINDOWS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('optin_request_id', optinRequestId);

    if (error) {
      console.error('Error counting reply windows:', error);
      return 0;
    }
    return count || 0;
  },

  // Still-open windows past expiry (for the reconcile cron)
  async getExpiredOpen(nowIso: string): Promise<ReplyWindow[]> {
    const { data, error } = await supabaseAdmin
      .from(REPLY_WINDOWS_TABLE)
      .select('*')
      .eq('status', 'open')
      .lt('expires_at', nowIso);

    if (error) {
      console.error('Error fetching expired reply windows:', error);
      return [];
    }
    return data || [];
  },
};

// --- Asserted contact state (what the app last set in GHL) ---

export const contactDncState = {
  async upsert(state: {
    location_id: string;
    contact_id: string;
    phone: string;
    sms_blocked: boolean;
    call_blocked: boolean;
    reason: string;
  }): Promise<boolean> {
    const { error } = await supabaseAdmin
      .from(CONTACT_DNC_STATE_TABLE)
      .upsert(
        { ...state, asserted_at: new Date().toISOString() },
        { onConflict: 'location_id,contact_id' }
      );

    if (error) {
      console.error('Error upserting contact DNC state:', error);
      return false;
    }
    return true;
  },
};

// --- Audit log ---

export const dncAudit = {
  async log(entry: {
    location_id: string;
    contact_id?: string;
    phone?: string;
    action: string;
    reason?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    // Mask phone to last 4 digits, consistent with existing logging
    const masked = entry.phone ? `***${entry.phone.slice(-4)}` : undefined;
    console.log(JSON.stringify({ event: 'dnc_audit', ...entry, phone: masked }));

    const { error } = await supabaseAdmin.from(DNC_AUDIT_TABLE).insert(entry);
    if (error) {
      console.error('Error writing DNC audit entry:', error);
    }
  },
};

// --- Combined consent state lookup ---

export async function getConsentState(
  locationId: string,
  contactId: string,
  phone: string
): Promise<ContactConsentState> {
  const [optout, activeConsent, openWindow, pendingOptin] = await Promise.all([
    optouts.get(locationId, phone),
    consents.getActive(locationId, phone),
    replyWindows.getOpen(locationId, contactId),
    optinRequests.getPending(locationId, contactId),
  ]);

  return {
    optedOut: !!optout,
    activeConsent,
    openWindow,
    pendingOptin,
  };
}
