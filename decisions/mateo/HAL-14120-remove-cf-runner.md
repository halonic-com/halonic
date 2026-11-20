# Decision: the Cloudflare runner trial is over, so its code and switch leave the repository

- Task: HAL-14120 (trial: HAL-13578, stopped in HAL-13979)
- Approval: the board stopped the trial (HAL-13979, option 1); Liam chose to remove the code on HAL-14120 and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:t0XH/+96oOz4lY5fO8VuV/eMUDhIdTnLqIOEtoYc4/qOmGs3SkdKPTrQo0eN/ttiOuoniPmLA5/+ON4wxYZjBA==

## What changes

- In `.github/workflows/ci.yml`, `Fast gates` and `Typecheck, lint, test, build` lose the
  `CF_RUNNER_TRIAL` switch and pick their runner like every other Linux job: the runner in
  `MERGE_QUEUE_RUNNER` for a merge group when that variable is set (HAL-14115), otherwise
  `ubuntu-24.04`. They used to ask for `cf-linux` when the repository variable
  `CF_RUNNER_TRIAL` was `merge-queue`. That variable is unset, so that branch never applied;
  nothing changes for any run.
- The infra test step no longer runs `infra/cf-runner/test.mjs`.
- `infra/cf-runner/` (the Worker, both images, the snapshot builder, the README and the tests)
  is deleted.
- `tooling/check/leak-allow.txt` drops its four entries for `infra/cf-runner/`.

## Why

The board stopped the trial, and the Worker, both container applications and their Durable
Objects are already deleted at Cloudflare. A switch that points at a runner that no longer
exists is a trap: if someone set `CF_RUNNER_TRIAL`, every Linux merge-group job would wait for a
runner that never starts. Code that doesn't run also goes stale without anyone noticing. The
trial report on HAL-13578 stays the record, and git history keeps the code.

## Tests

No test was weakened or skipped. The five tests in `infra/cf-runner/test.mjs` go with the code
they tested; the spend guard and turbo-cache tests still run.

## Covers

- .github/
- tooling/check/
