/**
 * DNC Checker with Caching
 * 
 * Checks phone numbers against Company Blacklist and National DNC lists
 * with configurable TTL caching to reduce API calls.
 */

import { dncCache } from './supabase';
import type { DncCheckResult, DncCheckLog } from '@/types';

// Configuration from environment variables (defaults to 12 hours)
const BLACKLIST_TTL_HOURS = parseInt(process.env.DNC_CACHE_TTL_BLACKLIST_HOURS || '12', 10);
const NATIONAL_TTL_HOURS = parseInt(process.env.DNC_CACHE_TTL_NATIONAL_HOURS || '12', 10);

// DNC API Configuration
const DNC_API_KEY = 'A542CEF7-898E-43E9-A2C3-18648BAE1A84';
const DNC_API_BASE = 'https://leads-dnc-api.ushealthgroup.com';

/**
 * Check if a cached timestamp is still fresh
 */
function isFresh(checkedAt: string | null, ttlHours: number): boolean {
  if (!checkedAt) return false;
  const ageMs = Date.now() - new Date(checkedAt).getTime();
  const ttlMs = ttlHours * 60 * 60 * 1000;
  return ageMs < ttlMs;
}

/**
 * Check company blacklist API
 */
async function checkCompanyBlacklistAPI(phone: string): Promise<{
  isOnList: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${DNC_API_BASE}/api/Blacklist/IsOnCompanyBlackList?phone=${encodeURIComponent(phone)}`,
      {
        headers: { 'X-API-KEY': DNC_API_KEY }
      }
    );
    
    if (!response.ok) {
      console.error('Blacklist API error:', { status: response.status });
      return { isOnList: false, error: `API returned ${response.status}` };
    }
    
    const data = await response.json();
    return { isOnList: data?.isOnCompanyBlacklist === true };
  } catch (error) {
    console.error('Blacklist API call failed:', error);
    return { isOnList: false, error: String(error) };
  }
}

/**
 * Check national DNC API
 */
async function checkNationalDNCAPI(phone: string): Promise<{
  isOnList: boolean;
  reason?: string;
  expiry?: string;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${DNC_API_BASE}/v2/DoNotCall/IsDoNotCall?phone=${encodeURIComponent(phone)}`,
      {
        headers: { 'X-API-KEY': DNC_API_KEY }
      }
    );
    
    if (!response.ok) {
      console.error('National DNC API error:', { status: response.status });
      return { isOnList: false, error: `API returned ${response.status}` };
    }
    
    const data = await response.json();
    const contactStatus = data?.contactStatus;
    
    // canContact=false means they're on the DNC list
    const isOnList = contactStatus?.canContact === false;
    
    return {
      isOnList,
      reason: contactStatus?.reason || undefined,
      expiry: contactStatus?.expiryDateUTC || undefined
    };
  } catch (error) {
    console.error('National DNC API call failed:', error);
    return { isOnList: false, error: String(error) };
  }
}

/**
 * Log DNC check for monitoring
 */
function logDncCheck(
  phone: string,
  result: DncCheckResult,
  cacheStatus: 'hit' | 'partial' | 'miss' | 'skipped_tagged',
  durationMs: number
): void {
  const log: DncCheckLog = {
    event: 'dnc_check',
    phone: `***${phone.slice(-4)}`, // Last 4 digits only for privacy
    cache_status: cacheStatus,
    blacklist_cached: result.blacklistFromCache,
    national_cached: result.nationalFromCache,
    result: {
      is_blacklist: result.isBlacklist,
      is_national_dnc: result.isNationalDnc
    },
    duration_ms: durationMs
  };
  
  console.log(JSON.stringify(log));
}

/**
 * Main DNC check function with caching
 * 
 * Checks cache first, only calls APIs for stale/missing data.
 * Each list (blacklist, national) is evaluated independently.
 */
export async function checkDnc(phone: string): Promise<DncCheckResult> {
  const startTime = Date.now();
  
  // 1. Get existing cache entry (may be partial/stale/missing)
  const cached = await dncCache.get(phone);
  
  // 2. Determine what needs refreshing
  const blacklistFresh = cached ? isFresh(cached.blacklist_checked_at, BLACKLIST_TTL_HOURS) : false;
  const nationalFresh = cached ? isFresh(cached.national_checked_at, NATIONAL_TTL_HOURS) : false;
  
  // Initialize result with cached values (if available)
  let isBlacklist = cached?.is_company_blacklist || false;
  let isNationalDnc = cached?.is_national_dnc || false;
  let nationalDncReason = cached?.national_dnc_reason || undefined;
  let nationalDncExpiry = cached?.national_dnc_expiry || undefined;
  
  // 3. Call APIs only for stale/missing data (in parallel)
  const apiCalls: Promise<void>[] = [];
  
  if (!blacklistFresh) {
    apiCalls.push(
      checkCompanyBlacklistAPI(phone).then(async (result) => {
        isBlacklist = result.isOnList;
        await dncCache.updateBlacklist(phone, result.isOnList);
      })
    );
  }
  
  if (!nationalFresh) {
    apiCalls.push(
      checkNationalDNCAPI(phone).then(async (result) => {
        isNationalDnc = result.isOnList;
        nationalDncReason = result.reason;
        nationalDncExpiry = result.expiry;
        await dncCache.updateNational(phone, result.isOnList, result.reason, result.expiry);
      })
    );
  }
  
  // Wait for any API calls to complete
  if (apiCalls.length > 0) {
    await Promise.all(apiCalls);
  }
  
  // 4. Determine cache status for logging
  let cacheStatus: 'hit' | 'partial' | 'miss';
  if (blacklistFresh && nationalFresh) {
    cacheStatus = 'hit';
  } else if (blacklistFresh || nationalFresh) {
    cacheStatus = 'partial';
  } else {
    cacheStatus = 'miss';
  }
  
  // 5. Build result
  const result: DncCheckResult = {
    isBlacklist,
    isNationalDnc,
    nationalDncReason: nationalDncReason || undefined,
    nationalDncExpiry: nationalDncExpiry || undefined,
    blacklistFromCache: blacklistFresh,
    nationalFromCache: nationalFresh
  };
  
  // 6. Log for monitoring
  logDncCheck(phone, result, cacheStatus, Date.now() - startTime);
  
  return result;
}

/**
 * Get cache TTL configuration (for debugging/dashboard)
 */
export function getCacheTTLConfig(): { blacklistHours: number; nationalHours: number } {
  return {
    blacklistHours: BLACKLIST_TTL_HOURS,
    nationalHours: NATIONAL_TTL_HOURS
  };
}
