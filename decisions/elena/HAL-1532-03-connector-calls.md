# Decision: connectors reach runs through the side-effect boundary

- Approval: step 4(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), and [HAL-3325](/HAL/issues/HAL-3325), which kept connectors out of runs until 4c; the package owner approves this note in review
- Kind: internal
- Task: HAL-1532

## What changes

`engine.run-tool-calls` said the engine offers no connector's tools in a run's model call and
refuses a call to one. That was the stand-in HAL-3331 wrote until the side-effect boundary existed
(the "allow sending" check, the idempotency key and the effect-requested record). This pull request
builds that boundary, so the requirement now says a run offers a connector's tools only where the
executor is given connector calls (`engine.run-connector-calls`), and checks a call to one as a
listed tool, `write` when its listing gives no risk. Without connector calls, nothing changes.

The test in `agent/check-run-tool-call.test.ts` that refused a connector's call "which runs don't
reach yet" is replaced by two tests: a call to a tool that only reads runs, and a call to one that
can change things, or whose listing gives no risk, asks a person first.

`engine.end-interrupted-runs` gains one sentence: before the engine ends running runs, a run with a
recorded connector call and no result gets `outcome: "unknown"` and waits for `retry` or `skip`.
Such a run is then waiting, which the requirement already leaves alone. Ending it as interrupted
would throw away a call that may have done its work, which `engine.unknown-outcome` forbids. Every
other running run is still ended as before, and no example changes.

## Why

Both were stand-ins for the step this pull request builds, so earlier parts didn't reach a
connector without the boundary. The calls that ran still run, and the argument checks stay as they
were.

## Covers

- engine.run-tool-calls
- engine.end-interrupted-runs
- packages/core/engine/src/agent/check-run-tool-call.test.ts
