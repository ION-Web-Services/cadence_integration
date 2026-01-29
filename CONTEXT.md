# CadenceCRM DNC Check — Working Context

## What This Is
A GHL (Go High Level) Marketplace app that intercepts outbound messages and checks contacts against DNC (Do Not Call) lists before they're contacted. Deployed on Vercel.

**Branding:** CadenceCRM DNC Check (logo at `/public/cadence-logo.jpg`)

## Stack
- **Framework:** Next.js 15.5.10 (TypeScript, Tailwind)
- **Hosting:** Vercel (cadenceintegration.vercel.app)
- **Database:** Supabase (lqmscljxxdtwyrjdpapt.supabase.co)
- **Repo:** https://github.com/ION-Web-Services/cadence_integration
- **Local path:** /Users/martincorona/clawd/mark-builds/cadence_integration/
- **Vercel team:** ionws (team_51tJCpdNkqqtvydtoDnwCH1E)

## How It Works
1. App installs into a GHL location via OAuth
2. Installation tokens stored in Supabase `cadence_installations` table
3. GHL sends webhooks to `/api/webhooks/ghl` for two event types:
   - **ContactCreate** — fires when a new contact is added (manual, import, or API)
   - **OutboundMessage** — fires when an agent sends SMS or makes a call
4. Webhook checks if contact already has DNC tags — skips if already flagged
5. Webhook checks `cadence_dnc_cache` table for cached results (12h TTL by default)
6. If cache miss/stale, fetches contact phone from GHL (or uses phone from ContactCreate payload), checks against two lists:
   - **Company Blacklist:** `GET /api/Blacklist/IsOnCompanyBlackList?phone=` → `{ phoneNumber, isOnCompanyBlacklist }`
   - **National DNC:** `GET /v2/DoNotCall/IsDoNotCall?phone=` → `{ phoneNumber, contactStatus: { canContact, reason, expiryDateUTC } }`
5. If flagged:
   - Fetches existing tags (preserves them)
   - Adds `DNC-USHEALTH` (company blacklist) and/or `DNC-NATIONAL` (federal DNC)
   - Sets DND on SMS + Call with message "DNC - Do Not Contact"
6. Hourly cron job refreshes OAuth tokens

## DNC API
- **Base URL:** https://leads-dnc-api.ushealthgroup.com
- **Swagger:** https://leads-dnc-api.ushealthgroup.com/swagger/index.html
- **Swagger JSON:** https://leads-dnc-api.ushealthgroup.com/swagger/v1/swagger.json
- **Auth:** Header `X-API-KEY: A542CEF7-898E-43E9-A2C3-18648BAE1A84`
- **Endpoints used:**
  - `GET /api/Blacklist/IsOnCompanyBlackList?phone=` → BlacklistResponse `{ phoneNumber, isOnCompanyBlacklist }`
  - `GET /v2/DoNotCall/IsDoNotCall?phone=` → DoNotCallResponseModelV2 `{ phoneNumber, contactStatus: { phoneNumber, canContact, reason, expiryDateUTC } }`
- **Other available endpoints (not currently used):**
  - `POST /api/DoNotCall/list` — batch check multiple phones
  - `POST /api/DoNotCall/listwithzip` — batch check with zip codes
  - `POST /api/DoNotCall/contactcenter` — contact center specific
  - `POST /v1.0/contact-management/contacts/{phone}/status` — update contact status count
  - `POST /api/Whitelist` and `/api/Whitelist/list` — whitelist management

## GHL OAuth
- **Client ID:** 65cc65b22cbe7a612c8b7958-me0euouv
- **Client Secret:** d5b60428-0250-4ffc-8b7c-0ea815ab68ff
- **Scopes:** conversations/message.readonly locations.readonly users.readonly contacts.readonly contacts.write conversations.readonly conversations/message.write
- **Redirect URI:** https://cadenceintegration.vercel.app/api/oauth/callback
- **Install URL generator:** `generateInstallationUrl()` in `src/utils/helpers.ts`

## Tagging Rules
- Company blacklist hit → tag: `DNC-USHEALTH`
- National DNC hit → tag: `DNC-NATIONAL`
- Both lists → both tags applied
- Existing tags on contacts are always preserved (fetched first, merged, then updated)
- DND enabled on SMS + Call channels
- No generic `DNC-Flagged` tag (removed)

## Pages
- `/` — Landing page (CadenceCRM branding, dark theme, how-it-works, features, install button)
- `/installation-success` — Post-install page (shows what's active, installation details)
- `/installation-error` — Error page with troubleshooting + retry link
- `/dashboard` — Dashboard page (existing, uses Pages Router)

## Key Files
- `src/app/page.tsx` — Landing page (App Router)
- `src/app/layout.tsx` — Root layout with metadata (title, description, favicon)
- `src/pages/installation-success.tsx` — Post-install success page
- `src/pages/installation-error.tsx` — Install error page
- `src/pages/dashboard.tsx` — Dashboard
- `src/pages/api/webhooks/ghl.ts` — Main webhook handler (DNC check + contact update)
- `src/pages/api/oauth/callback.ts` — OAuth install flow
- `src/pages/api/cron/refresh-tokens.ts` — Hourly token refresh
- `src/pages/api/cron/cleanup-dnc-cache.ts` — Weekly cache cleanup (Sundays 3am)
- `src/pages/api/ghl/[...endpoint].ts` — API proxy
- `src/lib/ghl-api.ts` — GHL API wrapper (Version header: 2021-07-28)
- `src/lib/token-manager.ts` — Token refresh logic
- `src/lib/supabase.ts` — Database operations (cadence_installations, cadence_dnc_cache, message_queue tables)
- `src/lib/dnc-checker.ts` — DNC check with caching logic
- `src/types/index.ts` — TypeScript interfaces
- `src/utils/helpers.ts` — Utilities (scopes, token expiry, install URL generation)
- `public/cadence-logo.jpg` — CadenceCRM logo

## Env Vars (Vercel)
- GHL_CLIENT_ID, GHL_CLIENT_SECRET
- NEXT_PUBLIC_APP_URL (https://cadenceintegration.vercel.app)
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- CRON_SECRET
- DNC_CACHE_TTL_BLACKLIST_HOURS (default: 12) — Cache TTL for company blacklist checks
- DNC_CACHE_TTL_NATIONAL_HOURS (default: 12) — Cache TTL for national DNC checks

## Resolved Issues
- ✅ Next.js CVE-2025-66478 — upgraded 15.4.1 → 15.5.10
- ✅ API key header casing — fixed `X-Api-Key` → `X-API-KEY` to match swagger
- ✅ DNC response parsing — verified against swagger spec, both endpoints correct
- ✅ 401 scope error — app reinstalled in GHL with `contacts.write` scope
- ✅ Success page stuck on "Loading..." — param mismatch fixed (userId/locationId)
- ✅ Landing page outdated — redesigned with CadenceCRM branding
- ✅ Metadata "Create Next App" — updated title, description, favicon
- ✅ Tag replacement wiping existing tags — now fetches existing tags and merges

## Potential Future Work
- Dashboard improvements (show active installations, DNC check stats)
- Batch DNC checking using `/api/DoNotCall/list` endpoint
- Message queue processing (table exists in Supabase but not actively used)
- GHL API version upgrade (currently using 2021-07-28)
- Contact center integration via `/api/DoNotCall/contactcenter`

## Recent Changes (Jan 29, 2026)
- **Added ContactCreate webhook support** — DNC check runs instantly when new contacts are added
  - Catches DNC contacts before any outreach happens
  - Uses phone directly from webhook payload (saves an API call)
  - Works alongside OutboundMessage checks for full coverage
- Implemented DNC check caching with configurable TTLs
- New `cadence_dnc_cache` table stores check results per phone
- Separate TTLs for blacklist (12h default) and national DNC (12h default)
- Skip DNC check entirely if contact already has DNC tags
- Added structured JSON logging for cache hit/miss monitoring
- Added weekly cache cleanup cron job (Sundays 3am)
- New env vars: `DNC_CACHE_TTL_BLACKLIST_HOURS`, `DNC_CACHE_TTL_NATIONAL_HOURS`
- Updated landing page with new features and "Add to your GHL" button

## Changes (Jan 28, 2026)
- Upgraded Next.js 15.4.1 → 15.5.10 (CVE fix)
- Replaced n8n forwarding with direct DNC API checks
- Fixed DNC response parsing + API key header casing
- Updated tags: DNC-USHEALTH (blacklist), DNC-NATIONAL (federal DNC)
- Existing tags now preserved on contact update
- Removed unused tagContact function and DNC-Flagged tag
- Redesigned all pages with CadenceCRM branding + dark theme
- Fixed success page param bug (userId vs user_id)
- Updated metadata (title, description, favicon)
- App reinstalled in GHL with correct scopes
