# Decision: a live-cloud workflow, gated by cloud-affected, off until the CI account exists

- Task: HAL-6701 (step 1c of the [HAL-198 build plan](/HAL/issues/HAL-198#document-build-plan), ADR 5.9)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-6701](/HAL/issues/HAL-6701)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:HyGvdjRKy6g8F/2gS7oOyTfsb3kEC0iFGLlgiyX2hy9MAxQ+Q7JmGmbp571ZB9jK+k7lIc+fTmsxKJWOPdGWAA==

## What changes

- `tooling/check` gets `cloud-affected`: it answers whether a change touches a cloud path and prints a hash of the inputs a live run depends on, so a passing live run is reused while none of them change.
- `.github/workflows/live-cloud.yml` runs the live suites when a pull request is marked ready for review and nightly on `main` (the nightly run sweeps first and never reuses a result). Every 6 hours it runs only the sweeper. Drafts and forks skip with a notice.
- `.github/workflows/ci.yml` gets a `live-cloud` job that `ci-ok` waits on. In the merge queue, a cloud-affected pull request can't merge until the live job passed on its head.
- `tooling/check` gets the `hlt-` sweeper skeleton: resource names, the 2-hour age rule and `--fail-on-delete` for the nightly run. There is no target sweeper yet; that comes with `destroy` in step 3b.

## Why

ADR 5.9 asks for live tests against a real cloud account, run only when a change can affect them, and a sweeper so a failed run can't leave paid resources behind. Everything stays off with a clear notice until the repo variable `LIVE_CLOUD_ENABLED` is `true`. A variable, not a check for the secret: an environment's secret is only visible inside a job that uses the environment, and a job that names a missing environment makes GitHub create it without protection rules. Whoever creates the protected `live-cloud` environment with the CI account token sets the variable at the same time.

## Tests

Unit tests for the cloud paths and the sweeper's names and age rule (`cloud-paths.test.ts`, `live-sweep.test.ts`). This pull request's own CI shows the off state: the live and sweep jobs skip with a notice and `ci-ok` passes.

## Covers

- .github/
- tooling/check/
