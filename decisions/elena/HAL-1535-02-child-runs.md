# Decision: child runs leave the list of effects the local executor can't carry out

- Requirement: `engine.local-runs-unbuilt-effect` (`packages/core/engine/requirements/local-runs-unbuilt-effect.md`)
- Approval: step 5(a) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), approved by Liam on [HAL-1515](/HAL/issues/HAL-1515); the package owner approves this note in review
- Kind: internal
- Task: HAL-1535

## What changes

The requirement's list of effects the local executor can't carry out yet drops "a child run or
telling the parent": the executor now carries out `start-child` and `tell-parent`
(`engine.local-child-runs`). It still names a tool call and a harness run. Its rule, its examples
and its test stay as they were.

## Why

The list was always "what isn't built yet". Step 5(a) builds child runs, so leaving them in would
make the requirement say something the code no longer does. No test was weakened.

## Covers

- engine.local-runs-unbuilt-effect
