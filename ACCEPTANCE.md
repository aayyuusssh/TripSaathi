# TripSaathi local acceptance

## Automated verification

Keep PostgreSQL and Redis running, then run from the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/project.ps1 verify
```

This checks types, domain rules, production builds and twelve isolated database/worker regressions. Provider responses and supplier reports in these regressions are explicitly synthetic. It does not buy tickets, call paid travel providers, send messages or validate a human Clerk login. Results are saved without credentials in `verification/local-acceptance.json`. Existing `*-smoke` and `verify-*provider*` scripts are separate real-call tools and are not included.

## Signed-in browser acceptance

Start `scripts/project.ps1 dev`, open http://127.0.0.1:3000 and sign in yourself. Never share a password, OTP or session token in chat.

1. Add an existing trip from your actual booking or a clearly named public-service test. Set unbooked arrangements to UNKNOWN. Use each airport's verified IANA timezone; flight arrival, hotel and pickup local times need the destination timezone.
2. Edit/add arrangements and connect real arrival deadlines. Leave assumptions unconfirmed. Onward/return flights and separate flight legs need separate arrangements and connections.
3. On a real imported flight, explicitly enable AirLabs monitoring. Check service/date/route, observation timestamp and LIVE provenance. No accepted ETA is guaranteed when the provider lacks coverage or required fields. Do not overwrite a live observation with replay.
4. Use a separate sandbox rehearsal to simulate 1-hour then 3-hour delays. Pending older plans must be superseded. Replay remains clearly labelled.
5. Request TinyFish public official policy or contextual alternatives explicitly. Inspect source, outcome, unknowns and expiry. BLOCKED/NOT_FOUND/uncertain results are legitimate outcomes. Never silently repeat an uncertain dispatch.
6. Search public flight or hotel alternatives. Check dates, adults, INR, observation expiry and separate nightly/stay price basis. These are not held inventory or payable supplier quotes.
7. Choose a current alternative, open Recovery and review exact guidance. Approval authorizes zero supplier spending. Only report supplier outcomes you actually observed; use clearly labelled synthetic reports on test trips.
8. Confirm that uncertain replacement results block dependent original-booking resolution. Reconcile through the actual supplier record before reporting completion.
9. After all handoffs complete, review confirmed hotel/flight details and explicitly apply the itinerary update. Check prior/recorded history, incremented revision and invalidated pending plans. For flights, old monitoring must need reconfirmation, old instance/lease must be cleared, and outgoing deadlines must need review. Re-enable monitoring explicitly after checking the new service.
10. Review pickup address/time and each downstream arrangement separately. A public-search suggestion, a user completion report and an independently verified supplier booking are different evidence levels.
11. Test document import with a non-sensitive sample first. Review all missing times/timezones, then save. Verify consent, removal/retention, in-app notifications, operations health and redacted report download.
12. Sign out; private UI and API must require authentication. A second account must not see the first account's trips, originals, reports or notifications.

## Boundaries requiring external access

- Airline/hotel/cab ticketing, charging, cancellation and refunds are not automated supplier transactions. The completed workflow is user handoff with user-reported outcomes.
- Rail itinerary, replay, public policy and recovery guidance are supported. Live rail status and booking require authorized rail-provider access; IRCTC consumer-account automation is not implemented.
- Real flight/provider coverage depends on the account, service and required response fields. Prior verification is not universal coverage.
- Remote production hosting is not enabled. App/API remain loopback-bound. Human login and authenticated browser acceptance must be recorded separately from local regression results.

## Observed signed-in browser run — 16 October 2026

Authenticated trip listing, separate sandbox creation, 1h→3h revision changes, superseded prior plans, exact in-app approval, worker sandbox verification, private synthetic upload/original download, redacted report export and online system health passed through the actual browser. Anonymous/invalid bearer requests still returned 401. See verification/browser-acceptance.json for scoped results. No paid travel provider was called in this pass; supplier transactions remain outside this verification.
