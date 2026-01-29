-- Migration: Create DNC Cache Table
-- Created: 2026-01-29
-- Description: Adds caching for DNC check results to reduce API calls

CREATE TABLE IF NOT EXISTS cadence_dnc_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) NOT NULL UNIQUE,
  
  -- Company blacklist
  is_company_blacklist BOOLEAN DEFAULT false,
  blacklist_checked_at TIMESTAMP,
  
  -- National DNC
  is_national_dnc BOOLEAN DEFAULT false,
  national_dnc_reason TEXT,
  national_dnc_expiry TIMESTAMP,
  national_checked_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast phone lookups
CREATE INDEX IF NOT EXISTS idx_cadence_dnc_cache_phone 
  ON cadence_dnc_cache(phone);

-- Indexes for cache expiry queries (cleanup + selective refresh)
CREATE INDEX IF NOT EXISTS idx_cadence_dnc_cache_blacklist_checked 
  ON cadence_dnc_cache(blacklist_checked_at);

CREATE INDEX IF NOT EXISTS idx_cadence_dnc_cache_national_checked 
  ON cadence_dnc_cache(national_checked_at);

-- Comment on table
COMMENT ON TABLE cadence_dnc_cache IS 'Cache for DNC (Do Not Call) check results to reduce API calls. TTL is configurable via env vars.';
