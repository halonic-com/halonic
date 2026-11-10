# Decision: a step on this computer logs `sandbox.off`

- Approval: board approval of proposal 1 ("What this run can do") in the `proposals` document on [HAL-1601](/HAL/issues/HAL-1601); the facts for the sandbox screens on [HAL-1782](/HAL/issues/HAL-1782) (P2); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1707

## What changes

- `engine.run-harness`: a step the person chose to run on this computer records `sandbox.off`
  with when they chose it, in place of `sandbox.opened`. The order of the step stays the same:
  `sandbox.started`, the session opens, then `sandbox.off` or `sandbox.opened`, then
  `harness.started`. The requirement gains an example for it.
- The engine's `PlacementPolicy.where` gives back `{ runsOn, chosenAt }` instead of the bare
  placement, so the engine can write `chosenAt`.
  `AgentPlacement.where` in `core/app` already gives `chosenAt` with a "this computer" answer, so
  the host can pass it straight on.

## Why

- Until now, a step on this computer went through the same path as a sandboxed one and logged
  `sandbox.opened` with a profile that nothing enforced, so the run page would have said the
  step was fenced in when it wasn't. `events.sandbox-off` (HAL-1707, PR #1359) says a step has
  either `sandbox.opened` or `sandbox.off`.
- `sandbox.started` stays for both: the launcher's session also has a start time limit, and the
  waits report already reads it.

No test was weakened or removed: the test for a step on this computer now also checks what it logs.

## Covers

- engine.run-harness
- packages/core/engine/src/harness/run-harness-call.test.ts
