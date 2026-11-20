# Decision: a runner start that throws straight away clears its time limit

- Approval: Liam asked for this follow-up in his review of HAL-12494 (halonic#3630) and assigned HAL-14110; Liam signs this note
- Kind: internal

## What changes

- `RunnerStartGate` set a start's time limit before it called `startIn`. A `startIn` that threw
  straight away, instead of returning a promise that rejects, left the limit waiting: the start
  failed with its error, and the timer went off later for a start that was already over. Its
  callback then did nothing, since the start had already failed, but the timer held the host's
  timers until it ran out.
- The gate now calls `startIn` inside a promise, so a throw straight away fails the start the same
  way as a rejection, and the limit is cleared.
- Requirement `app.runner-start-gate` gets the example of a start that fails, by rejecting or by
  throwing straight away: it fails with that error and leaves no time limit waiting. The rule
  itself is unchanged.

## Tests

No requirement was retired or weakened, and no test or golden file was skipped or deleted. One
test is added to `runner-start-gate.test.ts`: a `startIn` that throws straight away fails the start
with its error and leaves no timer waiting. It fails without the change.

## Covers

- app.runner-start-gate
- packages/core/app/requirements/runner-start-gate.md
- packages/core/app/src/runner-start-gate.test.ts
