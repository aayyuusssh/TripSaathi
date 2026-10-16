# TripSaathi setup and provider credentials

Current status: AirLabs + SerpApi alternatives are configured and verified live. FlightAware/Amadeus accounts are optional for the current recovery/search flow. TinyFish, Gemini and Clerk remain configured; AUTH_MODE=clerk. Local PostgreSQL/Redis need no external API key. Human browser login/UI verification remains pending.

## Docker status and remaining verification

The supplied screenshot shows **Engine running**. The empty Containers view means no containers are currently running; the Running-only filter can also hide stopped containers. The project requires PostgreSQL and Redis containers. There is no need to create containers manually in the Docker UI.

This Codex sandbox currently receives permission denied on `dockerDesktopLinuxEngine`, even though Docker Desktop is running. Run the setup in your normal Windows PowerShell:

```powershell
cd 'C:\Users\Lenovo\OneDrive\Desktop\TripSaathi'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 setup
```

Setup downloads/starts project containers, generates Prisma and deploys the initial migration. Then run the dev process in the same terminal:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 dev
```

In a second normal PowerShell, verify:

```powershell
cd 'C:\Users\Lenovo\OneDrive\Desktop\TripSaathi'
node scripts/doctor.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 build
node scripts/import-regression.mjs
```

Doctor prints configuration presence, never keys or passwords. The import regression verifies actual PostgreSQL with synthetic/fake-provider fixtures. The legacy integration.mjs HTTP script targets demo identity only and will receive 401 in managed login mode. Open http://127.0.0.1:3000 after dev startup. Do not mark live status or supplier transactions verified from a sandbox test.

## Required now

**TINYFISH_API_KEY**: create a key at [TinyFish API keys](https://agent.tinyfish.ai/api-keys). Add it locally to the ignored root `.env` and restart API/worker. Check available credits in your account; a real run may consume credits. This key enables the implemented public-policy research path, not live monitoring, inventory or bookings. [Official authentication](https://docs.tinyfish.ai/authentication).

No external keys are needed for local PostgreSQL or Redis. Their connection URLs are configured already. The database is real local persistence; replay transport events and sandbox supplier outcomes are different concerns.

Do not paste secret keys into chat or screenshots. Use a development key, put it in `.env`, and notify us that configuration is done. Real TinyFish verification should record the run ID, source passages, validated outcome and errors; empty/blocked results remain visible.

## Provider credentials and implementation status

| Purpose | Candidate credentials | Access and limitations |
|---|---|---|
| Live status (selected) | `AIRLABS_API_KEY` | Configured and verified on a real DEL-BOM public service. ETA/actual access is checked per response; strict route/time matching and conservative caps apply. |
| Public flight fare search (selected) | `SERPAPI_API_KEY` | Configured and verified with 10 INR fare observations. Public observations require supplier revalidation; no booking or refund authority. |
| Optional alternate live status | `FLIGHTAWARE_API_KEY` | Adapter and opt-in scheduler implemented. Add key to root .env, restart API/worker and enable Monitoring on a real operating flight. Coverage/API plan and actual response must be verified. |
| AI plan explanation/extraction | `GEMINI_API_KEY` | Explanation adapter implemented and verified live using the supplied key. Default gemini-3.1-flash-lite; advisory only. Consent-based document extraction implemented; synthetic PDF verified live. |
| Future optional supplier inventory | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`, environment selection | Test data is not live inventory. Production access and service coverage must be validated; ticket issuance/servicing may need additional arrangements. |
| User identity | Clerk development publishable/secret keys | Managed login/proxy and backend verification implemented; keys verified as a matching pair. Human browser sign-in remains to verify. Public key may be exposed, secret remains server-only. |
| Ground transfer time | `GOOGLE_MAPS_API_KEY` or chosen routing-provider credentials | Route estimates do not book or reschedule a cab. Restricted-key and billing configuration required for the chosen service. |
| Rail status/availability | Chosen authorized rail-provider credentials | No universal IRCTC consumer API key. Validate provider authorization, station/date data and permitted operations first. |
| Cab servicing | Contracted transfer-provider credentials | Maps or routing keys do not grant supplier inventory or servicing access. |

AirLabs status and SerpApi fare-search adapters are implemented and verified live with supplied keys. Gemini explanation/import is verified. FlightAware remains optional. Other future-provider placeholders remain inactive. TinyFish defaults to three reserved research runs per trip in a rolling 24 hours; FlightAware defaults to 24 requests per trip/UTC day and 200 installation-wide. These request/run caps do not guarantee currency spending. Do not purchase all services before access/cost/provider choices are agreed and tested. Future secrets belong in ignored `.env`; never commit real credentials. In-app notifications and encrypted local original storage are implemented; external notification/payment providers remain deferred.

Official references: [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/), [Gemini keys](https://ai.google.dev/gemini-api/docs/api-key), [Amadeus authentication and environments](https://admin.developers.amadeus.com/self-service/apis-docs/guides/developer-guides/quick-start/), [Clerk environment variables](https://clerk.com/docs/guides/development/clerk-environment-variables).

## What makes data real

An API key authenticates a request; the integration and verified response make the feature operational. Live aviation observations, live inventory, provider-confirmed changes and settled refunds each need their own implementation/evidence. No fallback should silently relabel a replay or invented price as LIVE.


## TinyFish run recovery (Chunk 7)

No additional key is needed for read-only reconciliation. The existing TINYFISH_API_KEY was verified through an authenticated bounded GET search; proof is `verification/tinyfish-readonly-verification.json`. This proves API access only. Use Research → Inspect existing run for uncertain new tasks or previously linked timed-out tasks. It does not create a browser automation or automatically retry a paid request. Three manual inspections per task, one-minute cooldown, exact task/run matching and ordinary evidence validation apply.

Legacy UNKNOWN_START without a correlation marker/run ID remains manual TinyFish dashboard review. The original uncertain hotel attempt has not been automatically resolved, repeated or relabelled as successful. Current FlightAware/Amadeus credentials remain absent in this installation; live-flight coverage and booking expansion still need a selected provider with the appropriate access. Keep new keys in ignored root .env and restart services after configuration.


## Current recommended keys (verified)

```dotenv
FLIGHT_STATUS_PROVIDER=AIRLABS
AIRLABS_API_KEY=your_key_already_added_locally
AIRLABS_DAILY_CALL_LIMIT=10
AIRLABS_MONTHLY_CALL_LIMIT=50
SERPAPI_API_KEY=your_key_already_added_locally
SERPAPI_MONTHLY_SEARCH_LIMIT=50
```

The real keys are already in ignored root .env. Do not copy these placeholder values over them. AirLabs signup currently has no card fields; actual key access to ETA/actual fields was confirmed. SerpApi signup has no card fields, supports Google/social login, and the account API confirmed access. Exact service/route coverage still varies.

AirLabs replaces the currently needed flight-status role. SerpApi replaces the currently needed public-flight-fare-search role, with observed prices requiring supplier revalidation. It does not issue tickets or supply Amadeus booking/servicing authority. Existing trip import and TinyFish workflow remain usable without either original provider. No hotel booking/price API adapter was added in this change.

