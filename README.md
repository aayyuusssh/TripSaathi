# TripSaathi

A local development platform for connected trip recovery. Flight/train arrivals, hotel deadlines and pickups share one itinerary. The current implementation supports existing-trip editing, opt-in monitoring adapters, impact analysis, evidence-linked guidance, sandbox demos, TinyFish public research optional Gemini advisory explanations, managed Clerk login, consent-based document import and an in-app inbox.

## Start on Windows

Node.js 22+ and Docker Desktop with a running Linux engine are required. PostgreSQL and Redis run in project containers; no global database installation is needed.

From PowerShell in this folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 setup
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 dev
```

Open http://127.0.0.1:3000. API docs: http://127.0.0.1:4000/docs.

`setup` provisions the database/queue and then exits. It does not start the web/API/worker. Keep the `dev` command running in terminal 1 before running diagnostics/integration checks in terminal 2. `ECONNREFUSED 127.0.0.1:4000` means the API is not listening yet; it does not mean another database key is required.

The setup script installs a project-local pnpm, workspace dependencies, starts containers and deploys tracked migrations. It never overwrites an existing `.env`. A Windows compatibility preload retries asynchronous `realpath` EPERM errors. If OneDrive denies junction creation, only the two internal workspace packages fall back to local copies, refreshed by `build:packages`. Other symlink failures are not suppressed.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 check
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 build
node scripts/import-regression.mjs
```

The import regression uses compiled services and real PostgreSQL with isolated synthetic fixtures. The legacy integration.mjs HTTP script requires AUTH_MODE=demo and running API/worker; managed mode correctly rejects anonymous HTTP calls.

For the duplicate-job/write-conflict regression, build the updated worker, then run the database concurrency check in a normal terminal:

```powershell
.tools\node_modules\.bin\pnpm.cmd --filter @tripsaathi/worker build
node scripts/worker-concurrency.mjs
node scripts/import-regression.mjs
```

The concurrency check submits twelve overlapping sandbox executions against one plan and asserts one confirmation event, no duplicate actions, and rejection of a superseded plan. Regression fixtures are isolated from the demo user's trip list. Outbox and reconciliation use one logical job ID; database row locks protect duplicate execution across workers.

Independent live TinyFish verification, using the compiled worker adapter and application evidence schema:

```powershell
node scripts/tinyfish-smoke.mjs
```

This starts one real public-policy run and may consume TinyFish credits. Its run ID/result are saved in `verification/tinyfish-policy-verification.json`. A blocked/invalid result is recorded as such. It does not require local database connectivity or claim a successful queued application workflow.

## TinyFish

Set `TINYFISH_API_KEY` in the ignored root `.env`, then restart API and worker. Never put the key in client code or commit it. Research is explicitly user-triggered, scoped to predefined public official policy URLs and may consume TinyFish credits. Its run ID and validated evidence are persisted. No policy result is fabricated when the key is missing.

An API configuration/path exists; successful live execution is not claimed without a key and an observed run. A completed external run still needs a valid evidence result. Submission uncertainty is recorded instead of silently retrying a potentially created run.

## Scope truth

- The template defaults to local demo identity. AUTH_MODE=clerk enables managed frontend sign-in and backend signature/issuer/origin verification. API remains on loopback; production deployment is not ready.
- AirLabs is the selected live flight-status provider; a real Delhi–Mumbai service observation was accepted. FlightAware remains optional. AirLabs coverage/field access varies by flight/account; missing estimates remain unverified. Rail status still requires an authorized provider.
- Demo recovery prices/confirmations are sandbox. Imported trips receive user-completion guidance with unverified costs labelled UNKNOWN and user-reported outcomes kept distinct from provider verification. No supplier bookings, payments or messages are submitted.
- Public TinyFish research is real when configured; it does not determine guaranteed refunds or ticket-specific eligibility.
- IRCTC consumer account automation is not implemented. Future rail actions need authorized integration or user completion.
- Full rail source/boarding dates, class/quota/reservation status, category-specific itinerary editing, onward connections, cancellation/diversion/arrival replay and multi-hop dependency propagation are implemented. Consent-based Gemini document extraction and explicit field review are implemented in Chunk 5.

## Chunk 3 monitoring and research

Use `AIRLABS_API_KEY` with `FLIGHT_STATUS_PROVIDER=AIRLABS` for the current setup. Restart API/worker, add a **real flight**, then use **Monitoring → Enable monitoring**. FlightAware remains an optional adapter; the following original AeroAPI-specific details apply only when it is selected. The AeroAPI adapter matches operating/codeshare number, departure time and airports; ambiguous/missing matches are reported without inventing a status. It uses gate-arrival estimates/actuals and links the exact FlightAware service ID. A changed status increments the trip revision, supersedes pending approvals and reassesses the dependency chain; an unchanged fresh check preserves plan revision.

Checks start 24 hours before departure and end 24 hours after imported arrival. Typical cadence is 30 minutes, tightening to 5 minutes near departure/arrival, with failure backoff up to an hour. The default trip cap is **24 requests per UTC day**, configurable from 4–96 in the UI; the lowest active arrangement cap applies across the trip. `FLIGHTAWARE_DAILY_CALL_LIMIT` defaults to 200 across this installation. Requests are reserved before dispatch and uncertain requests still count. These are request-count caps, not monetary guarantees. Monitoring windows/caps/failures can create gaps; freshness is visible. Once actual arrival is verified, the completed arrival fact remains usable after the polling freshness window.

Provider checks are opt-in; TinyFish is not called on every poll. **Research → Investigate a fallback** invokes a selected official IndiGo/IHG public site with whitelisted itinerary/impact context. No customer credentials, PNR or contact fields are included. Results contain source passages, unknowns and read-only candidates. Availability/price must be revalidated before any booking. Alternatives have a ten-minute evidence review window, policy evidence one day. Default TinyFish limit is three reserved runs per trip over a rolling 24 hours; uncertain/failed dispatches also consume a reservation. Site access may be blocked. Old trip revisions are not silently restarted.

Owner-guarded SSE (`GET /v1/trips/:id/events/stream`) delivers persisted events with reconnect cursors; snapshot polling remains a fallback. Managed Clerk login forwards short-lived session tokens server-side. The optional TinyFish HTTPS callback accepts a per-task token and run ID as a **hint**; callback bodies never become evidence directly. The worker confirms through the authenticated run-inspection API. Leave `TINYFISH_CALLBACK_BASE_URL` unset locally; no public tunnel is opened.

Verification scripts after build:

```powershell
node scripts/monitoring-regression.mjs
node scripts/tinyfish-alternatives-smoke.mjs
```

The first uses hidden synthetic fixtures and fake provider clients to test actual PostgreSQL concurrency, caps, rejected observations, status/revision handling and research safety without paid calls. The second attempts one real public hotel-research run and saves its actual outcome. The recorded attempt on 15 October had a network failure/no run ID and is `UNKNOWN_START`; live alternatives are **not verified**. Do not automatically repeat an uncertain dispatch. Earlier policy smoke evidence remains separately recorded.

Official integration references: [FlightAware AeroAPI v4 OpenAPI](https://www.flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml), [TinyFish webhook workflow](https://www.tinyfish.ai/blog/how-to-use-tinyfish-webhooks).

## Chunk 2 verification

`scripts/project.ps1 check` runs 21 domain/identity tests and all workspace type checks. After building, `node scripts/itinerary-regression.mjs` verifies real PostgreSQL persistence, owner isolation, mutation idempotency, stale revisions, old-status invalidation, graph rollback and cancellation propagation. `node scripts/worker-concurrency.mjs` verifies duplicate execution handling. Regression trips use isolated test owners.

The **Itinerary** tab supports flights, trains, hotels and transfers plus connection deadlines/buffers. Times are converted using IANA timezones; ambiguous/nonexistent daylight-saving times are rejected. Codes are format checked, not verified against an authoritative location directory. Editing an arrangement invalidates its prior status observations and supersedes pending recovery plans.

The **Providers** tab distinguishes public TinyFish policy research, manual replay, sandbox servicing and future adapters. Supplying a provider key alone does not implement that adapter. Identity configuration is documented in `.env.example`; use `AUTH_MODE=clerk` with matching Clerk development keys for private sign-in.

## Chunk 4 grounded recovery and workflow

Recovery distinguishes demo sandbox plans from existing-trip guidance. Existing-trip plans use deterministic impact rules and current schema/source-validated TinyFish evidence. Expired, superseded, blocked or off-source evidence is excluded. Public prices remain observations; they are not guaranteed totals or bookable inventory. Guidance approval records listed steps with **zero app spending authority**; provider acceptance, fees and inventory remain unknown until verified separately.

Actions have prerequisites. Handoff reports require a reference for completion and remain **USER_REPORTED_COMPLETED**, not independently verified. Unknown outcomes block dependents and are not retried automatically. Reconciliation requires explicitly inspecting the provider record. Withdrawal stops remaining permission, preserves completed/unknown history and never cancels a booking. Historical reconciliation cannot restore withdrawn permission. Changed/expired plans cannot advance new steps.

Optional Explain with Gemini generates structured advisory text for the reviewed actions/evidence. It cannot change authoritative actions, prices, digest or approval. Known action/evidence IDs are validated; prose still requires human review. Set GEMINI_API_KEY locally. Tested default: gemini-3.1-flash-lite, overridable through GEMINI_MODEL. Default cap: two reserved requests per trip/rolling 24 hours, bounded output, 30-second timeout and no silent retry. Customer references from action reports are not sent to this adapter.

A real Gemini application explanation completed on 15 October; proof is in verification/gemini-explanation-verification.json. Earlier rejected model/config requests and provider overload are retained separately. Live AI text does not prove live status, inventory or supplier servicing. FlightAware key, rail access and real booking adapters remain pending.

After build, run node scripts/recovery-regression.mjs for actual database ordering, ownership, withdrawal races, idempotency, reconciliation, partial/unknown failures and AI isolation. scripts/gemini-smoke.mjs makes one real explanation attempt and may consume provider quota. Official reference: [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Architecture

`apps/web`: Next.js interface. `apps/api`: NestJS local API. `apps/worker`: BullMQ outbox dispatch, durable sandbox execution and TinyFish polling. `packages/domain`: schemas, timing/approval rules and tests. `packages/database`: Prisma schema and migrations.

PostgreSQL stores workflow state. Redis delivers tasks. Outbox and periodic reconciliation support restart recovery; stable action keys avoid duplicated sandbox outcomes. Plan revision/digest, expiry and spending limit are checked before approval and execution. Verified prior actions remain in history after further delays.

See `TripSaathi-Technical-Architecture.md` for the full plan and `PROGRESS.md` for implementation status and the next chunk.


## Chunk 5 private imports, managed login and inbox

Set AUTH_MODE=clerk plus CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in the ignored root .env, then restart all processes. Clerk development keys were verified against authenticated/public JWKS endpoints; actual human browser sign-in still needs local verification. Native Clerk session JWTs require a valid signature, issuer, expiry, subject and allowed localhost authorized party. Web proxy forwards bearer tokens internally for REST, upload, download and SSE. Tokens are not placed in browser query strings or local storage. Query state remounts when the signed-in user changes. Existing local-demo trips remain under their original owner; they are not automatically assigned to the first signed-in account.

**Import documents** supports one PDF/PNG/JPEG/UTF-8 TXT up to 5 MB. MIME signatures, byte limits, image dimensions, owner quotas and owner access are checked. Raw originals use AES-256-GCM with owner/record authenticated data in PostgreSQL. A random key is generated in ignored .private/keys/imports.key unless IMPORT_ENCRYPTION_KEY is supplied. Back up and protect the key separately from the database; losing it makes retained originals unreadable. Windows filesystem permissions and disk/database backup security still require deployment hardening. Draft/itinerary metadata is owner scoped but is not encrypted as a whole database.

Gemini extraction requires explicit per-document consent to send the **complete file**, which may contain passenger data. The prompt excludes passenger identifiers from extraction, but model output remains untrusted and requires review. Local deletion cannot undo provider processing; use provider data-handling terms appropriate for your deployment. The adapter sends inline bytes, never follows document URLs and has no booking/payment tools. Missing values remain null; editable fields must pass the domain schemas. Review and save creates a new trip or atomically appends arrangements to the reviewed existing revision. Connections/deadlines are added separately in Itinerary. Original/draft removal after save is selected by default. No live monitoring is enabled merely by import.

Defaults: 24-hour original/draft retention (IMPORT_RETENTION_HOURS, 1–168), 20 retained originals/40 MB per owner, three reserved extraction requests per owner/rolling 24 hours (IMPORT_DAILY_EXTRACTION_LIMIT, max 10). Worker expiry purges data; failed/uncertain extraction has no automatic paid retry. Deletion while extraction is in progress prevents late draft persistence. Reviewed confirmation is idempotent and rejects changed details/stale revisions. Trip removal also removes its plans/history/inbox and linked original/draft; supplier bookings remain valid.

**Trip inbox** persists owner-scoped workflow notifications with read/unread controls and preferences. Simulation updates default off. Event cursor plus unique source keys prevent repeated delivery; first startup begins at the current event position rather than sending historical backlog. Delivery requires the worker. This chunk implements in-app delivery only. Workspace settings show key presence and work status without revealing credentials.

Verification after build:

```powershell
node scripts/import-regression.mjs
```

This uses actual PostgreSQL with synthetic documents/fake extraction to check ownership, consent, multipart acceptance, duplicate claims, reviewed save/append, expiry/deletion and notification delivery. `node scripts/verify-gemini-import.mjs` explicitly makes one paid-capable **synthetic PDF** request; it must not be run routinely. A real PDF extraction completed with FOUND/FLIGHT; sanitized proof is `verification/gemini-import-verification.json`. Test original/draft were removed. Reference: [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing).


## Chunk 6 guided rehearsal and operational health

The **Guided rehearsal** workspace creates a separate sandbox flight/train itinerary. Apply +1 hour, review/approve a plan through Recovery, return and apply +3 hours total, then review the newly revised recovery. Pending old plans become superseded; completed actions remain historical. Replay and sandbox execution are visibly labelled. Live TinyFish policy research stays an explicit user action in Research; no paid call is triggered just by opening the rehearsal. Alternative research still requires real imported booking context. A separate rehearsal never edits an existing booking or overwrites accepted live observations.

The **System health** workspace checks Redis connectivity and recent worker heartbeats. Each worker publishes every 10 seconds; older than 30 seconds is stale, loop failure or more than 90 seconds without dispatch/monitoring progress is degraded (startup grace applies). Samples are limited to eight recent workers; no worker identity, hostname, credentials or global cross-owner job counts are returned. This is process/scheduler health, not a guarantee of provider coverage or job completion. Owner-scoped failed/uncertain work links to its trip or document review. No automatic retry button is offered for uncertain paid operations.

The redacted JSON verification snapshot checks the current trip revision, status provenance/freshness, current validated FOUND research and sandbox/guidance outcome source. Expired/old-revision/off-source research cannot satisfy the TinyFish evidence check. It excludes passenger fields, document contents, booking references, callback tokens and keys; supplier transactions remain explicitly NOT_IMPLEMENTED. A snapshot is not a production certification or guaranteed inventory. Reports are owner guarded and regenerate on download.

After building, run:

```powershell
node scripts/release-regression.mjs
```

It uses actual Redis/PostgreSQL and labelled synthetic fixtures for heartbeat/progress, growing delays, stale approval rejection, sandbox execution, redaction, ownership and evidence expiry. It makes no provider calls and cleans up its trip. Core health uses the existing Redis deployment; no new API key or database migration is needed. Redis client reference: [ioredis documentation](https://github.com/redis/ioredis#readme).

## Chunk 7 TinyFish uncertain-run recovery

Research cards with UNKNOWN_START or TIMED_OUT offer **Inspect existing TinyFish run**. This is GET-only run search/inspection; it does not create a browser automation. New dispatches persist a task correlation marker before the network request. Recovery requires the exact original task goal (including official source), correlation marker and plausible dispatch timestamp. Unrelated account runs are not listed in the app or adopted. An ambiguous/truncated search requires an exact dashboard run ID. That ID is still independently inspected and matched; it is not accepted as evidence from user input alone.

Each task permits up to three manual inspection requests, at least one minute apart. Persistent request identity/outbox plus a claim prevents duplicate inspections. Queue loss can be reconciled from pending state; interrupted inspection is not automatically repeated. Owner and expected task-update checks apply. Reconciliation neither authorizes another paid browser run nor guarantees that reads are free under provider pricing. No-match does not prove that a run was never created.

Existing known run IDs can be inspected after timeout. Older UNKNOWN_START records without a run ID/correlation marker remain dashboard-only: the app cannot safely bind an arbitrary historical account run. In particular, the original hotel-verification uncertainty is preserved; no unverified run association or live alternative success is claimed.

Recovered results still pass source/schema/revision validation. Evidence expiry is anchored to the provider completion time (or original task creation if unavailable), never the later recovery time. Old hotel/flight observations cannot become fresh merely because polling resumed. A changed trip stores completion historically as SUPERSEDED.

After build:

```powershell
node scripts/research-recovery-regression.mjs
node scripts/verify-tinyfish-readonly.mjs
```

The first uses actual PostgreSQL and fake provider responses. The second makes a bounded authenticated GET-only TinyFish search and saves sanitized connectivity proof in `verification/tinyfish-readonly-verification.json`; it does not start/cancel automation. Actual read-only verification succeeded. It proves authenticated API access, not live offers or successful historical-run recovery. Official contracts: [get run](https://docs.tinyfish.ai/api-reference/runs/get-run-by-id), [list/search runs](https://docs.tinyfish.ai/api-reference/runs/list-and-search-runs).


## Provider alternatives verified — 15 October 2026

FlightAware/Amadeus signup is no longer a requirement for the implemented recovery/search flow. This installation selects **AirLabs** for arrival monitoring and **SerpApi** for observed flight fares. Both supplied keys were verified against actual APIs, then through application services/workers. Proof: `verification/alternative-providers-verification.json`.

- AirLabs: actual DEL–BOM public service SQ4865 produced an ACCEPTED LIVE observation, DELAYED by 57 minutes at verification. This is a public service observation, not proof of a passenger reservation or universal flight coverage. Verification subscription was paused afterward. Gate versus landing arrival basis remains provider dependent.
- SerpApi: one real Google Flights search for DEL–BOM, 17 October 2026, one adult, INR completed FOUND with 10 public fare observations. Fares have a ten-minute review window and require supplier revalidation. The provider offers 250 free searches/month at the checked date; the app conservatively reserves at most 50/month by default, plus two per trip/rolling 24 hours. Its existing account API returned 250 remaining before this verification search.
- AirLabs app caps default to ten requests/installation/UTC day and 50/month, separately from the trip cap. Its schedules endpoint advertises up to ten hours ahead; monitoring starts at that lead window. Exact number/codeshare, route and scheduled departure must match. No ETA/actual field means no accepted live confirmation. No automatic cross-provider fallback is used. Switching by explicit enable pauses another active provider subscription for that item.
- Flight fare search lives in Research alongside TinyFish. Search uses server credentials and queued persistent tasks; repeated request identity does not consume another reservation. Interrupted/failed search is UNKNOWN_OUTCOME and is not automatically repeated. Raw provider metadata/URLs containing keys, booking tokens, payment or passenger data are not stored. Only validated public route/date/currency, fare and leg fields survive. Airport-local times do not establish timezone/connection feasibility.
- TinyFish remains the public-policy/contextual alternatives evidence integration. SerpApi observations do not become TinyFish evidence or independently verified replacement inventory. Ticket issuance, payments, refunds and servicing need authorized supplier integration or user completion. Flight and hotel public-search adapters are implemented; supplier booking remains separate.

Run `node scripts/alternative-providers-regression.mjs` after build for synthetic actual-database tests. `node scripts/verify-alternative-providers.mjs` explicitly consumes real API calls including one fresh SerpApi search; do not run it routinely. Its verification itinerary is under an isolated owner and is labelled **not a reservation**.

Signup sources checked: [AirLabs signup](https://airlabs.co/signup), [SerpApi signup](https://serpapi.com/users/sign_up), [SerpApi free-plan increase](https://serpapi.com/blog/whats-new-at-serpapi-july-2025-changelog/). [Aviationstack free signup](https://aviationstack.com/signup/free) currently displays required card fields, so it was excluded from the cardless recommendation. [FlightAPI tracking](https://www.flightapi.io/flight-tracking-api/) advertises a no-card 30-day/20-credit trial as a limited backup, not a recurring free polling solution. Duffel test mode is useful for future development but remains sandbox; it was not substituted for real fare observations.

### Hotel fallback search

Research now supports imported hotel arrangements using the existing SERPAPI_API_KEY. Review local stay dates, area and adult occupancy before queuing. Flight and hotel searches share SERPAPI_MONTHLY_SEARCH_LIMIT; each hotel trip allows two requests per rolling 24 hours. Price observations expire after ten minutes and do not confirm room availability, late arrival acceptance or cancellation terms. No booking change is submitted.

After building, run node scripts/hotel-search-regression.mjs for synthetic PostgreSQL checks. The --live flag makes ONE real quota-consuming public search and saves sanitized proof; do not run it routinely. Real application verification passed on 15 October 2026.

### Reviewed hotel fallback workflow

From a current hotel observation, choose Prepare recovery with this option, then open Recovery. The saved GUIDANCE plan binds the selected source, option, trip revision, expiry and exact steps to its approval digest. Approval authorizes zero supplier spending. Arrival verification precedes replacement confirmation; original reservation review and pickup coordination wait for the replacement outcome. Unknown supplier outcomes require explicit reconciliation. Results remain USER_REPORTED, and itinerary/booking changes must be entered separately. Expired sources require a renewed search/review before a new approval.

Run node scripts/hotel-fallback-regression.mjs after building for an isolated PostgreSQL regression with synthetic provider reports and no external API calls.

### Apply a completed hotel recovery to the itinerary

After all hotel recovery handoffs are USER_REPORTED_COMPLETED, Recovery offers Review and update confirmed hotel details. Enter the actual property, address, stay dates, occupancy and booking status, review arrival deadlines, and acknowledge the update. This edits the app itinerary only. Pending plans are invalidated by the new revision; supplier reports remain user reported. Previous and recorded hotel details are retained in Itinerary → Reviewed hotel changes. Pickup details still need review separately. No new key or migration is needed.

### Replacement flight recovery

Research → Flight fares now offers Prepare recovery with this flight on fresh current observations. In Recovery, review original airline options, confirm actual replacement ticket issuance with the supplier, resolve original/remaining segments, and reconfirm hotel/pickup/onward travel. All steps are user handoffs; approval authorizes zero spending. Unknown ticketing outcomes block downstream actions until reconciled. No ticket, payment or cancellation is submitted by the app. Confirmed flight details still need manual itinerary editing. Earlier searches without an arrangement binding remain readable but require a fresh search before shortlisting.

After building, node scripts/flight-fallback-regression.mjs exercises the PostgreSQL workflow using synthetic public fares and supplier reports with no external requests.

## Full local acceptance

Run powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 verify with local PostgreSQL/Redis available. This builds/checks the app and runs twelve synthetic database/worker suites in an isolated disposable PostgreSQL schema, then cleans it. It does not make travel-provider requests. See ACCEPTANCE.md for signed-in browser checks and supplier-access boundaries.

Completed flight recovery now supports reviewed itinerary application with explicit arrival timezone, retained previous/recorded details, monitoring instance/lease reset and unconfirmed outgoing deadlines. Re-enable monitoring explicitly and review hotel/pickup/onward connections after a transport edit. Each flight leg is a separate arrangement; no layover feasibility is inferred from public fare times. Manual trip creation and document review support separate flight arrival timezones.
