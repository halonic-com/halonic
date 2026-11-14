# Decision: the engine's assembly replaces `localEngine`, and its tests move

- Approval: HAL-6602 (Liam, CTO); the note is signed in HAL-9699
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VaUr/2tbaQBCFB1laQwgXGDHEDPevVL+yBYM5dRXUW0L2KLr2XtYGyP6yZ64QUFYjwyEdfqdbgtOKFZ1P5dmBw==
- Task: HAL-8792

`assembleEngine` in `packages/core/engine/src/engine-assembly.ts` replaces `localEngine`, which had
no caller. The CLI host and the desktop Studio share the one assembly.

## Covers

- `engine.local-engine-routines`
- `engine.harness-stops-with-engine`
- `packages/core/engine/src/local-engine.test.ts`

## What changes

- `engine.local-engine-routines` is retired. Its text is carried by the new `engine.engine-assembly`
  (routines on the scheduler's ticks, each timer to the executor, a tick or timer that comes while
  the engine is built fails so the scheduler retries). The routine-start example of the old
  requirement is not repeated: it tested the routine scheduler, which has its own requirements.
- `local-engine.test.ts` is deleted. Its tests drove `localEngine`, so they go with it. The
  assembly's own tests are in `engine-assembly.test.ts`, under `engine.engine-assembly`.
- One test of `engine.harness-stops-with-engine` (a harness run going on when the host closes the
  engine, then the scheduler closes) went with `localEngine`, so that requirement has 6 tests where
  it had 7, and 25 expect calls where it had 31. The other six keep the behaviour: the executor
  stops a harness run when it closes (`run-harness-call.test.ts`, `local-runs-harness.test.ts`).

## Why

`localEngine` was built for one host and never called. Keeping it beside `assembleEngine` would
leave two assemblies to keep in step. The tests go with the code, and the behaviour the assembly
adds (close order, first failure wins, timers refused while the host holds them) is pinned in the
new requirement.

## Known gaps

- No test closes an assembled engine while a harness run is going on. The executor's close is
  tested for that; the assembly's close order is tested without a harness run.
