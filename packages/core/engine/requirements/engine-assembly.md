# engine.engine-assembly

- Status: active
- Since: unreleased
- Source: HAL-8792 (T8 PR 3b), decided on HAL-6602; replaces `engine.local-engine-routines`, whose `localEngine` had no caller

When a host puts the engine together, the engine package shall build the local executor on the scheduler the host passes in, give each timer the scheduler delivers to the executor, and give each tick to the routines the host builds on the engine's parts, using no store, scheduler or lock of its own, so the CLI (Node) and the desktop Studio (Tauri) share one assembly. When the host closes the engine, it shall stop the routines, close the executor, close the scheduler, run every closer the host gave in order, and release the host's lock last, each step running even when an earlier one failed and the close failing with the first failure; a second close shall do nothing more. A timer the host holds shall fail without reaching the executor, so the scheduler keeps it for the next engine. A timer that arrives before the executor is built shall fail, so the scheduler retries it.

## Examples

- Given an engine whose host gave two closers and a lock,
  when the host closes it,
  then the executor closes, then the scheduler, then both closers in order, then the lock is released.
- Given a closer that throws,
  when the host closes the engine,
  then the later closers still run, the lock is released, and the close fails with the first error.
- Given an executor whose close fails and a closer that fails after it,
  when the host closes the engine,
  then the scheduler, the closer and the lock release still run, and the close fails with the executor's error.
- Given a timer the host holds,
  when the scheduler delivers it,
  then it fails, the executor never sees it and `onTimerDone` isn't called.
- Given a scheduler that delivers a timer while it is being made,
  when the host assembles the engine,
  then that delivery fails with an error that says the engine is still starting.
