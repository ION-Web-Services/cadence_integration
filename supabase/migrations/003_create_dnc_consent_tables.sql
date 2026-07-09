-- DNC consent, opt-in, reply-window, opt-out, asserted-state and audit tables
-- All tables are server-only (accessed via service role key). RLS is enabled
-- with no policies so the anon key has zero access.

CREATE TABLE cadence_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  event_type VARCHAR(32) NOT NULL,           -- inbound_sms | inbound_call | optin_confirmed
  ghl_message_id VARCHAR(255) UNIQUE,        -- idempotency key for webhook retries
  conversation_id VARCHAR(255),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_consent_events_contact ON cadence_consent_events(location_id, contact_id);

CREATE TABLE cadence_optin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  trigger VARCHAR(16) NOT NULL,              -- national | blacklist
  status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending|confirmed|expired|failed|awaiting_review|approved|denied
  sent_message_id VARCHAR(255),
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  response_message_id VARCHAR(255),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_optin_lookup ON cadence_optin_requests(location_id, contact_id, status);
CREATE INDEX idx_optin_cooldown ON cadence_optin_requests(location_id, phone, sent_at);
CREATE INDEX idx_optin_sent_message ON cadence_optin_requests(sent_message_id);

CREATE TABLE cadence_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  source VARCHAR(32) NOT NULL,               -- optin_yes | admin_approved
  optin_request_id UUID REFERENCES cadence_optin_requests(id),
  granted_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason VARCHAR(64)                  -- stop_keyword | expired | admin
);
CREATE INDEX idx_consents_active ON cadence_consents(location_id, phone) WHERE revoked_at IS NULL;

CREATE TABLE cadence_reply_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  optin_request_id UUID REFERENCES cadence_optin_requests(id),
  channel VARCHAR(8) NOT NULL,               -- sms | call (the channel the contact used)
  opened_by_message_id VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open', -- open | used | expired | closed
  used_by_message_id VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_reply_windows_open ON cadence_reply_windows(location_id, contact_id)
  WHERE status = 'open';

CREATE TABLE cadence_optouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255),
  phone VARCHAR(32) NOT NULL,
  source VARCHAR(32) NOT NULL,               -- stop_keyword | manual
  ghl_message_id VARCHAR(255),
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE(location_id, phone)
);

CREATE TABLE cadence_contact_dnc_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  sms_blocked BOOLEAN NOT NULL,
  call_blocked BOOLEAN NOT NULL,
  reason VARCHAR(64) NOT NULL,
  asserted_at TIMESTAMPTZ NOT NULL,
  UNIQUE(location_id, contact_id)
);

CREATE TABLE cadence_dnc_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255),
  phone VARCHAR(32),
  action VARCHAR(48) NOT NULL,
  reason VARCHAR(128),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_contact ON cadence_dnc_audit(location_id, contact_id, created_at);

ALTER TABLE cadence_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_optin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_reply_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_optouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_contact_dnc_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_dnc_audit ENABLE ROW LEVEL SECURITY;
