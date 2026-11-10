# Decision: the engine's `parallel` state

- Approval: step 5(b) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), approved by Liam on [HAL-1515](/HAL/issues/HAL-1515); the package owner (Liam, core) approves this note in review
- Kind: internal
- Task: HAL-1536

## What changes

The engine runs `parallel` states (requirement `engine.parallel-state`). `RunState` gains
`parallel`, the branches of the state the run is in, and the snapshot version goes to 5. `decide`
hands a failed call that belongs to a branch to the state instead of failing the run, and the local
executor finds a branch's call by its id.

## Decisions

- **Name order.** Branches start, and their results are written, in name order. Runs keep their
  definitions as canonical JSON (HAL-186 decision 5), whose keys are sorted, so the order of the
  file is gone by the time a run reads them. The old runner used the file's order, so a run whose
  branches aren't already in name order differs from it there (the base fixture's `vendor` and
  `amount` do). Keeping the file's order means changing how definitions are kept and hashed; that
  is a follow-up, not part of this step.
- **A failed branch never ends the run on its own.** Branches don't cancel each other, so a
  `join: all` state fails once every branch has ended, with the first failed branch in name order.
  `agent.finished` records the failure (`events.agent-finished-error`).
- **An approval ends the branch with an error.** The spec says a branch agent can't pause for an
  approval; ending only that branch keeps `join` and `continueOnError` in charge of the outcome.
- **No harness agents in branches yet.** A branch whose agent runs in a program harness fails the
  run with an error that says so. The harness log follows one pending call and doesn't tag its
  events with `branch`; that joins later.

## Tests changed

`decide.test.ts` used `parallel` as its example of a state type the engine can't run yet; it now
uses `foreach`, which is still unbuilt. The check is the same. `run-state.test.ts` pins the folded
state, which gains `parallel: null`. No test was weakened or removed.

## Covers

- engine.parallel-state
- engine.state-registry
- engine.run-state-fold
