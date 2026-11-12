# Decision: a live-cloud workflow, gated by cloud-affected, off until the CI account exists

- Task: HAL-6701 (step 1c of the [HAL-198 build plan](/HAL/issues/HAL-198#document-build-plan), ADR 5.9)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-6701](/HAL/issues/HAL-6701)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7FsPp0cjbaoKcLscRMKsSHTT9fwsUu7rHCPs3pMO5MpzaAoREqBp4ya9ub/SAYtOHAHEUMYbchXiUTwIA+EqCw==

## What changes

- `tooling/check` gets `cloud-affected`: it answers whether a change touches a cloud path and prints a hash of the inputs a live run depends on, so a passing live run is reused while none of them change.
- `.github/workflows/live-cloud.yml` runs the live suites when a pull request is marked ready for review and nightly on `main` (the nightly run sweeps first and never reuses a result). Every 6 hours it runs only the sweeper. Drafts and forks skip with a notice.
- `.github/workflows/ci.yml` gets a `live-cloud` job that `ci-ok` waits on. In the merge queue, a cloud-affected pull request can't merge until the live job passed on its head.
- `tooling/check` gets the `hlt-` sweeper skeleton: resource names, the 2-hour age rule and `--fail-on-delete` for the nightly run. There is no target sweeper yet; that comes with `destroy` in step 3b.

## Why

ADR 5.9 asks for live tests against a real cloud account, run only when a change can affect them, and a sweeper so a failed run can't leave paid resources behind. Everything stays off with a clear notice until the repo variable `LIVE_CLOUD_ENABLED` is `true`. A variable, not a check for the secret: an environment's secret is only visible inside a job that uses the environment, and a job that names a missing environment makes GitHub create it without protection rules. Whoever creates the protected `cloudflare-live` environment with the CI account's secrets sets the variable at the same time. Once the variable is `true`, the first job stops with an error unless that environment exists with a branch policy and admin bypass off, so a mistake can't create it unprotected (a branch can edit that check away, so it guards against mistakes, not attacks).

## How the environment is protected

Liam decided this on [HAL-6835](/HAL/issues/HAL-6835#document-decision) (option B). Anyone who can push a branch here can read the token, because a pull request run uses the branch's own workflow and scripts. We accept that and limit what the token can do. Every rule must be in place before `LIVE_CLOUD_ENABLED` is `true`. Julian checks the real setup against this list on [HAL-6829](/HAL/issues/HAL-6829).

- **Names:** environment `cloudflare-live`, secrets `CLOUDFLARE_LIVE_API_TOKEN` and `CLOUDFLARE_LIVE_ACCOUNT_ID` ([HAL-6708](/HAL/issues/HAL-6708)).
- **Account:** a Cloudflare account just for CI that holds nothing else (not the halonic.dev or halonic.com account, no domains, no production data), with usage alerts for Workers requests, D1 and R2 sent to the board.
- **Token:** an account API token for that one account only, with Workers Scripts edit, D1 edit, Workers R2 Storage edit and Account Settings read. No DNS, zone, API Tokens or user scopes. It expires at most 35 days after it is created, so a missed monthly rotation fails closed.
- **Created by hand:** the environment is set up before the variable is turned on, never by a first run.
- **Branches:** "Selected branches and tags" with the patterns `main`, `*` and `**/*`, so every branch of this repository matches (`*` doesn't match a `/`, so `**/*` covers branches like `mateo/HAL-…` and the merge queue's `gh-readonly-queue/main/…`). Forks never get the token: GitHub passes no secrets to fork pull requests, and the workflow skips them.
- **No required reviewers, no wait timer, admin bypass off** (`can_admins_bypass: false`). Every agent pushes as `halonic-dev`, so a required reviewer would mean the board approving every live run.
- **Environment secrets only:** the token and account ID are never repository or organisation secrets, so no other workflow can read them.
- **Review:** changes to `live-cloud.yml`, the live test code and the sweeper need Julian's review. A change that sends the token anywhere other than the Cloudflare API, or prints it, is rejected.
- **If the token leaks or an alert fires:** revoke the token in Cloudflare (board), delete the environment secret, set `LIVE_CLOUD_ENABLED` to `false` and open a task for Liam.

## Tests

Unit tests for the cloud paths and the sweeper's names and age rule (`cloud-paths.test.ts`, `live-sweep.test.ts`). This pull request's own CI shows the off state: the live and sweep jobs skip with a notice and `ci-ok` passes.

## Covers

- .github/
- tooling/check/
