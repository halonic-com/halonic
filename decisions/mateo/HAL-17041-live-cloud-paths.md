# Decision: only the Cloudflare targets are cloud paths, and /health is asked again on a 5xx

- Approval: /HAL/issues/HAL-17041
- Kind: internal

## What changes

- `check.cloud-affected` and `check.live-cloud-queue`: of `packages/targets`, only `packages/targets/cloudflare/` is a cloud path, in `cloudPathPatterns` and in `pullRequestLivePatterns` (before: all of `packages/targets/`). A change under `packages/targets/node/` no longer runs the live suites. A new cloud target gets its own pattern when it gets a live suite.
- `cloudflare-live.transfer`: the smoke check asks `/health` again when it answers a 5xx, up to 4 tries in all with 5 s between them, and names Cloudflare's error number when it gives up. Any other status still fails at once.
- The existing smoke test that expects a 503 to fail now injects a fake `sleep`, so the retries don't wait for real; it still expects the 503 failure.

## Why

The live suites deploy only `targets/cloudflare/*`. A Node target change (#5489, HAL-17003) ran the full live suite for code the Worker never loads.

On #5489 the first `/health` call to a just-deployed Worker answered 500 twice (15:05 and 15:56 UTC) while the admin routes and webhooks on the same Worker passed a second later. `/health` is a pure handler with no bindings, so the 500 came from Cloudflare's edge, not our code. The admin-key checks already wait like this through `eventually`.

## Tests

New tests in `transfer-checks.test.ts`: a 500 then a 200 passes after one wait (it failed before the fix), four 500s fail naming Cloudflare error 1101 and not the host, and a 403 fails at once. `cloud-paths.test.ts` adds Node target paths as not cloud paths. Package tests pass (66 in `testing-cloudflare-live`, 37 in the two cloud-path files).

## Covers

- check.cloud-affected
- check.live-cloud-queue
- cloudflare-live.transfer
- tooling/check/
- packages/testing/cloudflare-live/src/transfer-checks.test.ts
