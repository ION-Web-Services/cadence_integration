# DNC Check Caching Implementation Plan

> Created: 2026-01-29
> Status: Planning

## Problem

Currently, every outbound message triggers a DNC check against both APIs. This is inefficient because:
- Same contacts receive multiple messages
- API calls add latency to webhook processing
- Unnecessary load on DNC API

## Solution

Implement a 12-hour cache for DNC check results. Skip API calls if we have a fresh cached result.

## Cache Rules

| List | Cache TTL | Env Var | Reason |
|------|-----------|---------|--------|
| Company Blacklist | 12 hours (default) | `DNC_CACHE_TTL_BLACKLIST_HOURS` | Internal list, can change daily |
| National DNC | 12 hours (default) | `DNC_CACHE_TTL_NATIONAL_HOURS` | Rarely changes, can increase later |

TTLs are configurable via environment variables. Defaults to 12 hours if not set.

## Database Schema

New table: `cadence_dnc_cache`

```sql
CREATE TABLE cadence_dnc_cache (
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

-- Index for fast lookups
CREATE INDEX idx_cadence_dnc_cache_phone ON cadence_dnc_cache(phone);

-- Indexes for cache expiry queries (cleanup + selective refresh)
CREATE INDEX idx_cadence_dnc_cache_blacklist_checked ON cadence_dnc_cache(blacklist_checked_at);
CREATE INDEX idx_cadence_dnc_cache_national_checked ON cadence_dnc_cache(national_checked_at);
```

**Note:** Separate `blacklist_checked_at` and `national_checked_at` timestamps allow independent TTL evaluation. One can be fresh while the other is stale.

## Logic Flow

```
Webhook receives OutboundMessage
    │
    ▼
Extract contact phone
    │
    ▼
Check if contact already has DNC tag ──► YES ──► Skip (already flagged)
    │
    NO
    ▼
Query cadence_dnc_cache for phone
    │
    ▼
Check each list independently:
    │
    ├─► Blacklist cache fresh? (< BLACKLIST_TTL hours)
    │       YES → use cached blacklist result
    │       NO  → call Blacklist API, update cache
    │
    ├─► National cache fresh? (< NATIONAL_TTL hours)
    │       YES → use cached national result
    │       NO  → call National DNC API, update cache
    │
    ▼
Combine results (either from cache or fresh API calls)
    │
    ▼
If flagged → tag contact + enable DND
```

**Key point:** Each list is evaluated independently. If blacklist cache is fresh but national is stale, only the national API is called.

## Skip Conditions

Before any cache/API check, skip entirely if:
1. Contact already has `DNC-USHEALTH` tag (company blacklist)
2. Contact already has `DNC-NATIONAL` tag (federal DNC)

This prevents re-checking contacts we've already flagged.

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/supabase.ts` | Add `cadence_dnc_cache` table operations (get, upsert) |
| `src/pages/api/webhooks/ghl.ts` | Add cache check before API calls, add skip logic for tagged contacts |
| `src/types/index.ts` | Add `DncCacheEntry` interface |

## New Functions

### `src/lib/supabase.ts`

```typescript
// Get cached DNC result (returns null if not found or stale)
async function getDncCache(phone: string, maxAgeHours: number = 12): Promise<DncCacheEntry | null>

// Upsert DNC check result
async function upsertDncCache(entry: DncCacheEntry): Promise<void>
```

### `src/lib/dnc-checker.ts` (new file)

```typescript
// Get TTLs from env (defaults to 12 hours)
const BLACKLIST_TTL_HOURS = parseInt(process.env.DNC_CACHE_TTL_BLACKLIST_HOURS || '12');
const NATIONAL_TTL_HOURS = parseInt(process.env.DNC_CACHE_TTL_NATIONAL_HOURS || '12');

// Main function that handles cache + API logic
async function checkDnc(phone: string): Promise<DncResult> {
  const startTime = Date.now();
  
  // 1. Get existing cache entry (may be partial/stale)
  const cached = await getDncCache(phone);
  
  // 2. Determine what needs refreshing
  const blacklistFresh = cached && isFresh(cached.blacklist_checked_at, BLACKLIST_TTL_HOURS);
  const nationalFresh = cached && isFresh(cached.national_checked_at, NATIONAL_TTL_HOURS);
  
  // 3. Call APIs only for stale/missing data
  const apiCalls: Promise<any>[] = [];
  if (!blacklistFresh) apiCalls.push(checkCompanyBlacklist(phone));
  if (!nationalFresh) apiCalls.push(checkNationalDnc(phone));
  
  const apiResults = await Promise.all(apiCalls);
  
  // 4. Merge cached + fresh results
  const result = mergeResults(cached, apiResults, blacklistFresh, nationalFresh);
  
  // 5. Upsert cache with new data
  await upsertDncCache(phone, result);
  
  // 6. Log for monitoring
  logDncCheck(phone, result, blacklistFresh, nationalFresh, Date.now() - startTime);
  
  return result;
}

function isFresh(checkedAt: string | null, ttlHours: number): boolean {
  if (!checkedAt) return false;
  const age = Date.now() - new Date(checkedAt).getTime();
  return age < ttlHours * 60 * 60 * 1000;
}
```

## New Environment Variables

Add to Vercel:

```env
# DNC Cache TTLs (hours) - defaults to 12 if not set
DNC_CACHE_TTL_BLACKLIST_HOURS=12
DNC_CACHE_TTL_NATIONAL_HOURS=12
```

## Logging

Every DNC check logs:

```typescript
console.log(JSON.stringify({
  event: 'dnc_check',
  phone: phone.slice(-4), // Last 4 digits only for privacy
  cache_status: 'hit' | 'miss' | 'stale' | 'skipped_tagged',
  blacklist_cached: boolean,
  national_cached: boolean,
  result: {
    is_blacklist: boolean,
    is_national_dnc: boolean
  },
  duration_ms: number
}));
```

This allows monitoring:
- Cache hit rate
- API call volume
- Check latency (cache vs API)

## Type Definitions

```typescript
interface DncCacheEntry {
  phone: string;
  is_company_blacklist: boolean;
  blacklist_checked_at: string | null;
  is_national_dnc: boolean;
  national_dnc_reason: string | null;
  national_dnc_expiry: string | null;
  national_checked_at: string | null;
}

interface DncResult {
  isBlacklist: boolean;
  isNationalDnc: boolean;
  nationalDncReason?: string;
  blacklistFromCache: boolean;
  nationalFromCache: boolean;
}
```

## Webhook Handler Changes

Current flow:
```typescript
// Always calls both APIs
const [blacklistResult, dncResult] = await Promise.all([
  checkCompanyBlacklist(phone),
  checkNationalDnc(phone)
]);
```

New flow:
```typescript
// 1. Check if already tagged
const contact = await getContact(contactId);
const existingTags = contact.tags || [];
if (existingTags.includes('DNC-USHEALTH') || existingTags.includes('DNC-NATIONAL')) {
  console.log('Contact already tagged, skipping DNC check');
  return res.status(200).json({ status: 'skipped', reason: 'already_tagged' });
}

// 2. Check with caching
const dncResult = await checkDnc(phone); // Handles cache internally

// 3. Tag if needed
if (dncResult.isBlacklist || dncResult.isNationalDnc) {
  // ... existing tagging logic
}
```

## Optional: Cache Cleanup

Add a cron job to clean up old cache entries (> 30 days) to prevent table bloat:

```typescript
// /api/cron/cleanup-dnc-cache.ts
DELETE FROM cadence_dnc_cache 
WHERE blacklist_checked_at < NOW() - INTERVAL '30 days' 
  AND national_checked_at < NOW() - INTERVAL '30 days'
```

Add to `vercel.json`:
```json
{
  "path": "/api/cron/cleanup-dnc-cache",
  "schedule": "0 3 * * 0"  // Weekly, Sunday 3am
}
```

## Testing Plan

1. **Cache miss** — New phone, should call APIs, cache result
2. **Cache hit (fresh)** — Same phone within 12 hours, should use cache
3. **Cache hit (stale)** — Same phone after 12 hours, should re-check APIs
4. **Already tagged** — Contact with DNC tag, should skip entirely
5. **Blacklist only** — Phone on company blacklist, not national
6. **National only** — Phone on national DNC, not blacklist
7. **Both lists** — Phone on both lists

## Rollout

1. Create `cadence_dnc_cache` table in Supabase
2. Deploy code changes
3. Monitor logs for cache hit/miss ratio
4. Verify API call reduction

## Expected Impact

- **API calls reduced by ~80-90%** (most messages go to repeat contacts)
- **Faster webhook response** (cache lookup vs API call)
- **Lower load on DNC API**

## Decisions

- [x] **Cache TTL configurable via env var** — Yes. `DNC_CACHE_TTL_BLACKLIST_HOURS` and `DNC_CACHE_TTL_NATIONAL_HOURS`
- [x] **Separate TTLs for blacklist vs national** — Yes. Allows tuning independently (e.g., extend national to 24h+ later)
- [x] **Log cache hit/miss for monitoring** — Yes. Log every check with cache status for observability
