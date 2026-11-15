# Decision: live smoke, admin-key and export round-trip checks for the Worker

- Approval: the task asks for this change (HAL-6706, part 3 of 3c); Liam approves this note in review, Julian reviews the live code (HAL-6701)
- Kind: internal

## What changes

- New requirement `cloudflare-live.transfer`, and `live/transfer.live.test.ts` in `@halonicjs/testing-cloudflare-live`: smoke (`/health`), the admin routes closed without a key, bad keys refused while one is set, the example export imported twice and exported again, and the admin routes closed once the job ends.
- `src/transfer-checks.ts` holds the checks; `readAsNode` reads an export folder the way a Node import will (schema, sizes and hashes, log parsing, names, no unlisted file).
- `fixtureWorkerName` is exported, so the suite finds the fixture's Worker for `withAdminKey`.
- Dev dependencies on `@halonicjs/format` and `@halonicjs/ports`.

## Why

This is what 3c asks for before merge and nightly. The live run also sets and removes a real Workers secret, which no fake proves. The job uses the example export in `core/format`, so there is one set of example data.

## Not covered

There is no Node importer yet, so "into Node" is a read check of the folder, not an import. Nothing has run against Cloudflare: the CI account's token isn't set up (HAL-6829 / HAL-6703). The first live run checks the secret removal, the 404 that follows and that a re-export returns the imported bytes; keep `LIVE_CLOUD_ENABLED` off until then. Removing a secret makes a new Worker version, so the closed check retries for up to 30 seconds.

## Covers

- cloudflare-live.transfer
