# Cadence Integration — Working Context

## What This Is
A GHL (Go High Level) Marketplace app that intercepts outbound messages and checks contacts against DNC (Do Not Call) lists before they're contacted. Deployed on Vercel.

## Stack
- **Framework:** Next.js 15.5.10 (TypeScript, Tailwind)
- **Hosting:** Vercel (cadenceintegration.vercel.app)
- **Database:** Supabase (lqmscljxxdtwyrjdpapt.supabase.co)
- **Repo:** https://github.com/ION-Web-Services/cadence_integration
- **Local path:** /Users/martincorona/clawd/mark-builds/cadence_integration/

## How It Works
1. App installs into a GHL location via OAuth
2. Installation tokens stored in Supabase `cadence_installations` table
3. GHL sends `OutboundMessage` webhook to `/api/webhooks/ghl`
4. Webhook fetches contact phone from GHL, checks against:
   - **Company Blacklist:** `GET /api/Blacklist/IsOnCompanyBlackList?phone=` → `{ isOnCompanyBlacklist: bool }`
   - **National DNC:** `GET /v2/DoNotCall/IsDoNotCall?phone=` → `{ contactStatus: { canContact: bool, reason: string } }`
5. If flagged: updates contact in GHL with DND + tags
6. Hourly cron job refreshes OAuth tokens

## DNC API
- **Base URL:** https://leads-dnc-api.ushealthgroup.com
- **Swagger:** https://leads-dnc-api.ushealthgroup.com/swagger/index.html
- **Auth:** Header `X-API-KEY: A542CEF7-898E-43E9-A2C3-18648BAE1A84`
- **Endpoints used:**
  - `GET /api/Blacklist/IsOnCompanyBlackList?phone=` → BlacklistResponse `{ phoneNumber, isOnCompanyBlacklist }`
  - `GET /v2/DoNotCall/IsDoNotCall?phone=` → DoNotCallResponseModelV2 `{ phoneNumber, contactStatus: { phoneNumber, canContact, reason, expiryDateUTC } }`

## GHL OAuth
- **Client ID:** 65cc65b22cbe7a612c8b7958-me0euouv
- **Client Secret:** d5b60428-0250-4ffc-8b7c-0ea815ab68ff
- **Scopes requested:** conversations/message.readonly locations.readonly users.readonly contacts.readonly contacts.write conversations.readonly conversations/message.write
- **Redirect URI:** https://cadenceintegration.vercel.app/api/oauth/callback

## Tagging Rules (Martin's spec)
- Company blacklist hit → tag: `DNC-USHEALTH`
- National DNC hit → tag: `DNC-NATIONAL`
- **TODO:** Confirm with Martin:
  - Set DND on contact or just tag?
  - Both tags if on both lists?
  - Append to existing tags or replace?
  - Keep generic `DNC-Flagged` tag too?

## Known Issues / TODO
1. **401 Scope Error** — Existing GHL installation token doesn't have `contacts.write` scope. App needs reinstall in GHL to get fresh token with correct scopes. Install link:
   `https://marketplace.gohighlevel.com/oauth/chooselocation?client_id=65cc65b22cbe7a612c8b7958-me0euouv&redirect_uri=https%3A%2F%2Fcadenceintegration.vercel.app%2Fapi%2Foauth%2Fcallback&response_type=code&scope=conversations%2Fmessage.readonly+locations.readonly+users.readonly+contacts.readonly+contacts.write+conversations.readonly+conversations%2Fmessage.write`
2. **Tag replacement** — `PUT /contacts/{contactId}` with `tags: [...]` may replace all tags instead of appending. Need to GET existing tags first, merge, then PUT.
3. **`tagContact` function** — Defined but never used (eslint warning). Remove or integrate.
4. **GHL API Version** — Using `Version: 2021-07-28` header. May need updating for newer contact endpoints.

## Key Files
- `src/pages/api/webhooks/ghl.ts` — Main webhook handler (DNC check + contact update)
- `src/pages/api/oauth/callback.ts` — OAuth install flow
- `src/pages/api/cron/refresh-tokens.ts` — Hourly token refresh
- `src/pages/api/ghl/[...endpoint].ts` — API proxy
- `src/lib/ghl-api.ts` — GHL API wrapper
- `src/lib/token-manager.ts` — Token refresh logic
- `src/lib/supabase.ts` — Database operations
- `src/types/index.ts` — TypeScript interfaces
- `src/utils/helpers.ts` — Utilities (scopes, token expiry, install URL generation)

## Env Vars (Vercel)
- GHL_CLIENT_ID, GHL_CLIENT_SECRET
- NEXT_PUBLIC_APP_URL (https://cadenceintegration.vercel.app)
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- CRON_SECRET

## Recent Changes (Jan 28, 2026)
- Upgraded Next.js 15.4.1 → 15.5.10 (fixed CVE-2025-66478)
- Replaced n8n webhook forwarding with direct DNC API checks
- Fixed DNC response parsing to match swagger spec
- Fixed API key header casing (X-Api-Key → X-API-KEY)
- Verified both DNC endpoints working via direct curl tests
- Discovered 401 scope issue on contact update — needs GHL reinstall
