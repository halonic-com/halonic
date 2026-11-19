# Decision: a pull request's build runs as three parallel jobs

- Approval: the plan on HAL-9808 (Liam approved Option 1, pull requests only, step 1); Liam approves this note in review on HAL-9808 and signs it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7pgQm5OqvhnWrk4G0ijuVk9LoZRhLR/95yp0+wsK9B3WCAqQsmtld5ihxsLo/sRckj/1kUlgrxmmceWujNrsCA==

## What changes

In `.github/workflows/ci.yml`, the `Typecheck, lint, test, build` job becomes a matrix. One
expression picks the shards: a pull request runs `checks` (typecheck, lint, build), `test-1`
(the tests of nine of the ten slowest packages, `TEST_1_PACKAGES`) and `test-2` (every other
package's tests, as `--filter=!…`). The slowest, `adapter-password-scrypt`, stays in `test-2`:
in `test-1`, with only heavy tests beside it, one of its scrypt tests ran past its 180 s limit. Main and the merge queue run one job, `all`, as before, with `trace`
and the cache save.

- `checks` first runs `turbo run test --dry=json` for all packages and for each test shard,
  and fails unless the shards add up to every test task exactly once and each listed package
  has a test task.
- Each test shard uploads `pull-request-test-results-<shard>`. The guard downloads both by
  exact name, fails if either is missing or empty, and unpacks each with the same plain-files
  check as before. It also fails when the build job ended as skipped or cancelled. The merge
  base's archive is still read by ID and checked against its sha256.
- `ci-ok` keeps `build` as one entry in `needs`: a matrix job reports one result, failed if a
  shard failed.
- The scenario-state and timings artifacts get the shard in their name.

No trigger, right, runner or secret changes. Every timeout stays at 25 minutes: a cold
merge-queue run is still one job of about 14 minutes.

## Why

A cold pull-request build took 14 to 24 minutes in one job. Tests are about two thirds of the
work (65.4 % and 66.7 % in two cold probe runs), and the run is bound by throughput, not by one
long chain, so three jobs cut a cold run to about 7 to 11 minutes.

## Tests

No test was weakened or skipped. Every test still runs on every pull request, and the dry-run
check proves it.

## Covers

- .github/
