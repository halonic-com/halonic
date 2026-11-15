# Decision: run the storage adapters' contract suites in a test Worker on the CI account

- Task: HAL-6703 (step 2a of the HAL-198 build plan, ADR 5.9), part 1: R2 and D1
- Approval: the task asks for this change; Liam approves this note in review
- Kind: internal

## What changes

- `target-cloudflare-testing`: the test Worker answers only a request with `Authorization: Bearer <HALONIC_TEST_RUNNER_TOKEN>` and refuses everything when it has no token. It also answers `POST /self-test` (with the deploy's own token), which `uploadAndSwitch` needs. The local `WorkerdRunner` generates a token and sends it. New `RemoteRunner` (the same `cases()` and `run()` over the network) and `mirrorCases`, which `runSuitesInWorkerd` already used internally.
- `testing-cloudflare-live`: `deployAdapterRunner` deploys the test Worker with a D1 database and two R2 buckets bound as `DB`, `BLOBS` and `DEFINITIONS`, all named with the run's `hlt-` prefix. New `live/adapters.live.test.ts` bundles the R2 blob, R2 definition and D1 record/token suites that already run in local workerd, deploys them, and shows each case as a test. The teardown moved out of the webhook fixture into `teardownFor`, shared by both.
- New requirement `cloudflare-live.adapters`.

## Why

The same suites that pass in local workerd now also run on real R2 and D1, before merge and nightly, through the existing `live-cloud` workflow. The Worker is public on workers.dev and runs code that writes to the account, so it must check a token. A secret per run (never printed, masked in Actions) keeps that cheap.

## Not in this part

Durable Object and alarm suites need a clock the live runner can't move (the local suites move one inside the isolate); Workers secrets suites follow. Nothing has run against Cloudflare yet: the CI account's token isn't set up (HAL-6829, HAL-6708).

## Tests

Unit tests for the Worker's token checks, `RemoteRunner`, and `deployAdapterRunner` against a fake API. The three suites were bundled and listed in local workerd.

## Covers

- cloudflare-live.adapters
