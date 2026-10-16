# TripSaathi implementation instructions

Read README.md, PROGRESS.md and TripSaathi-Technical-Architecture.md before continuing.

- Preserve the TypeScript modular-monolith and separate worker design.
- Update PROGRESS.md with actual implemented scope, verification and next chunk.
- Never claim live monitoring, offers, refunds or transactions when data is replay/sandbox.
- Keep keys in ignored .env; do not print or commit secrets.
- Do not automate IRCTC consumer accounts.
- Keep the local demo bound to loopback until managed authentication and ownership checks are implemented.
- Run meaningful domain tests, TypeScript checks and builds. Database/worker integration checks need running infrastructure.
- Use scripts/project.ps1 to handle this host's OneDrive package compatibility.
- An approval is tied to exact plan revision/digest, expiry, budget and maximum spend. New observations invalidate pending stale plans.
