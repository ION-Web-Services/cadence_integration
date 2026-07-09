# DNC Consent & Opt-In Implementation Plan

## Problem

Contacts who reach out to an agent first (inbound SMS/call) get DNC-flagged and DND-blocked
by the ContactCreate/OutboundMessage webhook, so the agent cannot reply. Real-world case:
a contact blocked another agent in the company (company DNC) but *wants* to talk to this
specific agent — today the system makes that impossible.

At the same time, any fix must not give agents a lever to bypass company or national DNC.

## Design Principles

1. **Nothing an agent can do lifts a block.** Only the contact's own verified actions
   (inbound message + explicit YES reply) unlock anything. Tags are outputs for
   visibility, never inputs to the block decision.
2. **Double opt-in for every unlock.** An inbound message alone never unlocks — it only
   triggers a system-sent opt-in request. Only the contact's affirmative reply (YES)
   creates consent. This upgrades us from inferred consent to documented express consent
   (message ID + timestamp as evidence).
3. **Per-agent scoping is free.** One GHL sub-account per agent means DND is per-location,
   so a YES to agent A unlocks only agent A's account. The contact stays blocked for all
   other agents.
4. **Idempotent state evaluation.** Every webhook recomputes desired state from stored
   facts (list status, consents, opt-outs) via one decision engine. Event ordering
   (ContactCreate vs InboundMessage races) stops mattering.
5. **Audit everything.** Every block/unblock/opt-in event is written to an audit table —
   compliance defense and abuse detection.

## The Opt-In Flow (real-world walkthrough)

1. A blocked contact texts an agent's GHL number → `InboundMessage` webhook.
2. System checks: opted out? → stay blocked, done. Pending opt-in + affirmative reply? →
   confirm (step 5). Otherwise, if the contact is on a DNC list and no opt-in was sent
   recently (cooldown), send ONE templated opt-in message:

   > Hi, this is {LocationName}. You reached out to us — reply YES to confirm
   > you'd like to receive calls and texts from this number. Reply STOP to opt out.

   Sent via GHL conversations API (`conversations/message.write` scope already granted).
3. **Reply window opens.** After sending the opt-in request, DND stays lifted on the
   channel the contact used (SMS if they texted, Call if they called) for
   `REPLY_WINDOW_HOURS` (default 24) — long enough for the agent to send ONE custom
   reply answering the contact's actual question. A `DNC-REPLY-WINDOW` tag makes the
   allowance visible to the agent in the GHL UI.
4. **One-message enforcement.** The `OutboundMessage` webhook (already subscribed) is the
   enforcer: the first outbound message on that contact that isn't the system's own
   opt-in message marks the window `used`, re-asserts DND immediately, removes the
   `DNC-REPLY-WINDOW` tag, and audits. If the agent never replies, the window expires on
   its own and the reconcile cron re-blocks. Each subsequent *inbound* from the contact
   (while the opt-in is still pending) opens one fresh reply window — strictly
   one-for-one, always contact-initiated — up to `REPLY_WINDOWS_MAX` (default 5) per
   opt-in request.
5. Contact replies YES → consent recorded (with response message ID), DND lifted on SMS +
   Call in this location only, tags updated (`DNC-*` tags stay; add `DNC-OPTIN-CONFIRMED`,
   remove `DNC-REPLY-WINDOW`), audit logged. National-DNC-triggered: unlock immediately.
   Blacklist-triggered: behavior per `BLACKLIST_OPTIN_MODE` (see Open Decisions).
6. No reply / non-affirmative reply → request expires (default 48h), contact stays
   blocked, logged.
7. Consent lasts `CONSENT_DURATION_DAYS` (default 90), then the reconcile cron re-blocks.
   A STOP at any time revokes consent permanently and closes any open window.

### Reply-window abuse analysis

- Window only opens on a verified inbound message — agents cannot create one for a cold
  lead.
- One outbound consumes it; the webhook re-block lands within seconds. An agent
  rapid-firing several messages before the re-block is a small residual race — every
  extra message is logged as a violation in the audit table, so probing is detectable.
- Any outbound during the window consumes it, including workflow/automation sends —
  conservative on purpose. Channel-scoping (only the inbound channel opens) further
  limits automation leakage.
- One-for-one replies without YES can't become a campaign: the contact must initiate
  every exchange, and `REPLY_WINDOWS_MAX` caps the total before YES is required.

Why agents can't abuse it: they can't trigger the flow (only a verified inbound message
does), can't word the message (fixed template), can't answer it (only the contact's number
in the same conversation counts), and can't keep it open (only contact YES + expiry rules
govern). Manually flipping DND off in the GHL UI gets reverted by the reconcile cron and
logged.

## Decision Engine

New pure module `src/lib/dnc-decision.ts`. All handlers route through it.

Priority order:

| # | Condition | SMS | Call | Side effects |
|---|-----------|-----|------|--------------|
| 1 | Opted out (STOP) | blocked | blocked | Permanent; nothing lifts it |
| 2 | Active consent (YES, unexpired, unrevoked) | open | open | Tags: keep DNC-*, add DNC-OPTIN-CONFIRMED |
| 3 | Open reply window (unused, unexpired) | open* | blocked* | *Only the channel the contact used; tag DNC-REPLY-WINDOW |
| 4 | Company blacklist | blocked | blocked | Inbound within cooldown → opt-in flow per mode |
| 5 | National DNC | blocked | blocked | Inbound within cooldown → opt-in flow |
| 6 | Clean | open | open | — |

Notes: mere inbound contact never grants durable consent — it opens at most a single-use
reply window while YES remains the only lasting unlock. Full unlock via YES opens both
channels (the template asks for consent to "calls and texts"); reply windows open only
the channel the contact used.

## New Supabase Tables

```sql
-- Immutable evidence of contact-initiated events (dedupes webhook retries)
CREATE TABLE cadence_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  event_type VARCHAR(32) NOT NULL,           -- inbound_sms | inbound_call | optin_confirmed
  ghl_message_id VARCHAR(255) UNIQUE,        -- idempotency key
  conversation_id VARCHAR(255),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Opt-in request lifecycle
CREATE TABLE cadence_optin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  trigger VARCHAR(16) NOT NULL,              -- national | blacklist
  status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending|confirmed|expired|awaiting_review|approved|denied
  sent_message_id VARCHAR(255),
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  response_message_id VARCHAR(255),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_optin_lookup ON cadence_optin_requests(location_id, contact_id, status);
CREATE INDEX idx_optin_cooldown ON cadence_optin_requests(location_id, phone, sent_at);

-- Active consent grants (what currently permits contact)
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

-- Single-use agent reply windows (one per verified inbound while opt-in pending)
CREATE TABLE cadence_reply_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  optin_request_id UUID REFERENCES cadence_optin_requests(id),
  channel VARCHAR(8) NOT NULL,               -- sms | call (the channel the contact used)
  opened_by_message_id VARCHAR(255) NOT NULL, -- the inbound message that opened it
  status VARCHAR(16) NOT NULL DEFAULT 'open', -- open | used | expired | closed
  used_by_message_id VARCHAR(255),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_reply_windows_open ON cadence_reply_windows(location_id, contact_id)
  WHERE status = 'open';

-- Permanent opt-outs (STOP)
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

-- What the app last asserted per contact (drives reconciliation)
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

-- Full audit trail
CREATE TABLE cadence_dnc_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id VARCHAR(255) NOT NULL,
  contact_id VARCHAR(255),
  phone VARCHAR(32),
  action VARCHAR(48) NOT NULL,  -- blocked | unblocked | optin_sent | optin_confirmed |
                                -- optin_expired | reblocked_expired | reblocked_reconcile |
                                -- optout_recorded | blacklist_review_queued | notify_sent
  reason VARCHAR(128),
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_contact ON cadence_dnc_audit(location_id, contact_id, created_at);
```

## Keyword Handling (strict, small sets)

Normalize: trim, lowercase, strip punctuation, take first token.

- **Affirmative:** `yes`, `y`, `yeah`, `yep`, `confirm` — only counts if a `pending`
  opt-in request exists for this contact. A YES with no pending request is logged and
  ignored (no unlock).
- **Opt-out (CTIA standard):** `stop`, `stopall`, `unsubscribe`, `cancel`, `end`, `quit` —
  records opt-out, revokes any consent, asserts block. GHL handles STOP natively too;
  we record it so we never unlock later.
- Anything else: no state change; if a pending request exists it stays pending until expiry.

## Webhook Changes (`src/pages/api/webhooks/ghl.ts`)

- Add `InboundMessage` to `SUPPORTED_EVENTS`.
- **InboundMessage handler:**
  1. Dedupe by `ghl_message_id` (unique constraint on consent_events).
  2. Record consent event.
  3. STOP keyword → record opt-out, revoke consent, assert block via engine. Done.
  4. Affirmative + pending request → confirm request, create consent grant, run engine
     (unlocks), tag, audit, close any open reply window. Blacklist trigger in `review`
     mode → `awaiting_review` + notify instead of unlock.
  5. Otherwise, if contact is on a DNC list, no active consent, no opt-out:
     - No request within cooldown → lift DND on the inbound channel, send opt-in
       request, record `pending`, open a reply window (DND stays lifted), tag
       `DNC-REPLY-WINDOW`, audit.
     - Request already pending and reply windows used < `REPLY_WINDOWS_MAX` → open a
       fresh reply window for this inbound (no re-send of the opt-in message).
- **OutboundMessage handler:** first checks reply windows. If the message is the
  system's own opt-in send (matches `sent_message_id`) → ignore. If an open reply
  window exists → mark `used`, re-assert DND, remove `DNC-REPLY-WINDOW` tag, audit
  `reply_window_used`. If a blocked contact somehow received a message with no open
  window → audit as a violation. Then the existing DNC-check path runs through the
  decision engine.
- **ContactCreate handler:** unchanged detection logic, but final action goes through
  the decision engine instead of calling `updateContactDNC` directly. Critical fix this
  buys us: a consented contact (or one with an open reply window) will no longer be
  re-blocked when the DNC cache says "on list" — consent and windows outrank list status.
- Every DND write updates `cadence_contact_dnc_state`.

## New Cron: `/api/cron/reconcile-dnc` (hourly, CRON_SECRET-protected)

1. Expire `pending` opt-in requests past `expires_at` → status `expired`, audit.
   Expire `open` reply windows past `expires_at` → re-assert DND, remove tag, audit.
2. Expire consents past `expires_at` → revoke (`expired`), re-assert block, audit
   `reblocked_expired`.
3. Manual-flip detection: for contacts in `cadence_contact_dnc_state` where we assert
   blocked, fetch current GHL DND; if someone turned it off and there's no active
   consent → re-assert block, audit `reblocked_reconcile` (this is the abuse-detection
   sweep). Batch with rate limiting; only sweeps contacts we've ever flagged.

Add to `vercel.json` crons.

## Config (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `OPTIN_WINDOW_HOURS` | 48 | How long a YES is awaited |
| `REPLY_WINDOW_HOURS` | 24 | How long the agent has to send their one custom reply |
| `REPLY_WINDOWS_MAX` | 5 | Max one-for-one reply windows per opt-in request before YES is required |
| `OPTIN_COOLDOWN_DAYS` | 30 | Min days between opt-in requests per contact |
| `CONSENT_DURATION_DAYS` | 90 | How long a YES unlock lasts |
| `BLACKLIST_OPTIN_MODE` | `review` | `review` (YES queues for admin approval) or `auto` (YES unlocks + notify) |
| `NOTIFY_WEBHOOK_URL` | — | Optional webhook (Slack/etc.) for blacklist events & reconcile findings |

## Files

**New:**
- `src/lib/dnc-decision.ts` — pure decision engine
- `src/lib/consent.ts` — consent/opt-in/opt-out DB operations + keyword parsing
- `src/lib/optin-sender.ts` — templated send with lift/send/re-block sequencing
- `src/pages/api/cron/reconcile-dnc.ts` — reconciliation cron
- `supabase/` migration for the new tables

**Modified:**
- `src/pages/api/webhooks/ghl.ts` — InboundMessage handling, route through engine
- `src/lib/supabase.ts` — new table accessors
- `src/types/index.ts` — new interfaces
- `src/utils/helpers.ts` — phone normalization to E.164 (consent/opt-out keys must match
  cache keys)
- `vercel.json` — reconcile cron entry
- `CONTEXT.md` — document the new flow

## Edge Cases

- YES with no pending request → ignore + audit (prevents "prime the pump" gaming).
- Contact on both lists → blacklist rules govern (stricter wins).
- STOP after YES → consent revoked, permanent opt-out; future YES does not auto-unlock
  (requires admin approval path if ever).
- Opt-in send failure → re-assert DND immediately (no reply window opens), request
  marked failed; retried on next inbound after cooldown check.
- Agent sends multiple messages before the webhook re-block lands → residual race of a
  few seconds; extras are audited as violations so probing is detectable.
- STOP during an open reply window → window closed, DND re-asserted, permanent opt-out.
- Contact texts again while a window is already open → no new window (one open at a
  time); the open one persists until used/expired.
- Webhook retries/duplicates → deduped by message ID unique constraint.
- Contact with no phone or unparseable phone → skip, as today.

## Open Decisions (need business/compliance sign-off)

1. **Blacklist mode default** — recommend `review` (human approves blacklist unlocks;
   the list may contain litigators). `auto` available per config.
2. **STOP propagation** — should a STOP to one agent be reported company-wide (e.g., to
   the blacklist owner)? Currently scoped per-location. Flag to compliance.
3. **Consent duration** — 90 days default mirrors the TSR inquiry window; compliance
   should confirm (state mini-TCPAs may be stricter).
4. **Whitelist push** — after a documented YES, optionally `POST /api/Whitelist` on the
   DNC API so future checks pass with the consent record as backing. Nice-to-have;
   confirm with the DNC API owner.

## Phasing

- **Phase 1 (core fix):** tables, decision engine, InboundMessage + opt-in flow, YES
  confirmation, STOP handling, expiry via reconcile cron, audit log. Blacklist YES →
  `awaiting_review` + notify (no approval UI yet; approval via admin endpoint w/ secret).
- **Phase 2 (hardening):** manual-flip reconciliation sweep, GHL webhook signature
  verification, whitelist push, blacklist approval flow polish.
- **Phase 3 (visibility):** dashboard views — pending opt-ins, audit trail, block/unblock
  stats per location.
