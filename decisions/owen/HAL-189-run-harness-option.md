# Decision: the workflow runs service passes on the run's harness

- Requirement: `app.run-start` (`packages/core/app/requirements/run-start.md`)
- Task: HAL-189, step 6b (the CLI side of `halonic run --harness`)
- Approval: Liam's decision on HAL-3789 asks for `--harness` as an optional `harness` on `StartRunRequest`; the maintainer approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xngGBc7NhuzhGBdfSpsPZxEZBwVfqA7jTwfD0FvCcugfB/z/mR/3CG7/KXkExza/U78xLPjl/KfJJXtYsNwQBg==

## What changes

`WorkflowRuns.startRun` takes an optional `harness` with its other options and passes it to the
executor's `start`, which records it on `run.started` and refuses an id that isn't a harness
(engine side of 6b, already on `main`). The requirement's sentence names it, and one example is
added: a run started with the harness `codex` reaches the executor with it. A start without a
harness is the same as before.

## Why

`halonic run --harness` starts its run through this service, so the service has to carry the
option to the executor. It stays a field of its own, not a key in the run's input, so it never
reaches a prompt (Liam, HAL-3789).

## Tests

No test was weakened. One test is added for the new example.

## Covers

- app.run-start
