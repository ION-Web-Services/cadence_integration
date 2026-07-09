-- Single-flight token refresh: callers atomically claim before refreshing
ALTER TABLE cadence_installations ADD COLUMN IF NOT EXISTS refresh_claimed_at TIMESTAMPTZ;

-- At most one in-flight opt-in request per contact (two simultaneous inbound
-- texts could otherwise double-send the opt-in message)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_optin_inflight
  ON cadence_optin_requests(location_id, contact_id)
  WHERE status IN ('sending', 'pending');
