# Decision: live-cloud runs take turns on the test account, oldest run first

- Task: HAL-13840
- Approval: the task asks for this change (HAL-13840, split from HAL-13834); `.github/` is the guard's own path, so Liam approves this note in review
- Kind: internal

## What changes

- In `.github/workflows/live-cloud.yml`, the `live-cloud` job gets a step `Wait for the account`
  before the account probe. It is skipped when the job reuses an earlier pass.
  `timeout-minutes` goes from 60 to 105 to make room for the wait.
- New `tooling/check/src/lib/live-turn.ts` and `tooling/check/src/cli/live-turn.ts` with the
  requirement `check.live-turn`. Through the Actions API they read the other unfinished
  `live-cloud.yml` runs and wait while another run holds the account (its job is past the wait
  step and its `Run the live suites` step hasn't finished), or while a run with a lower ID still
  hasn't finished its suites. They list the runs in one call and poll every 2 minutes, to spare the
  repository's shared `GITHUB_TOKEN` budget. After 45 minutes, or when GitHub can't be read,
  they print a warning and go ahead, as before this change.
- `tooling/check/README.md` and `docs/guides/checks.md` list the new command.

Nothing in the guard's trust roots changes: the requirement guard and `note-check.ts` don't
import `live-turn.ts`.

## Why

Run 44609587031 failed with D1's "too much load" error while several pull requests ran the live
suites against the one CI account at the same time. The concurrency group is per pull request,
so it doesn't stop that. One account-wide concurrency group would: but GitHub keeps only one
pending run per group and cancels the others, and a cancelled run fails that pull request's
`Live cloud suites passed` gate. Taking turns inside the job cancels nothing. The lowest run ID
always goes first, so two runs can't wait for each other forever.

Retrying on D1's load error inside the suites was left out: the error comes from deep inside the
adapter under test, and retrying it there would mean a retrying wrapper in the harness or Vitest
retries, which the test rules ban.

## Covers

- .github/
- tooling/check/
