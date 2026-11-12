# Decision: a run's tool call that needs an OK stops the run instead of being refused

- Approval: HAL-3325 sets the three parts of HAL-3331, and this is part 3; the package owner approves this note in review
- Kind: internal
- Task: HAL-3331

## What changes

`engine.run-tool-calls` said that until a run could stop for a person's OK, a call that needs one
is refused. Part 3 builds the stop, so the requirement now says such a call stops the run for an
approval, as `engine.turn-approval-stop` says, and its example says the run waits for `approve` or
`reject` on that call. The test for the interim refusal in `run/local-runs-tools.test.ts` is
replaced by `run/local-runs-tool-approval.test.ts`, which covers the stop, approve, reject with a
comment and going on after a restart.

The test in `run/local-runs-approval.test.ts` that failed a run going on after an approval
"while runs offer no tools" (from #960) is removed. That guard is gone, because runs now offer tools
and go on from `resume`; the new tests prove what replaced it.

## Why

Both were stand-ins for the step this pull request builds, written so earlier parts didn't drop a
call silently. Nothing that worked before stops working: the calls that ran still run, and the
argument checks and connector refusal stay as they were.

## Covers

- engine.run-tool-calls
- packages/core/engine/src/run/local-runs-tools.test.ts
- packages/core/engine/src/run/local-runs-approval.test.ts
