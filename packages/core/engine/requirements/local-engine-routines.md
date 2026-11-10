# engine.local-engine-routines

- Status: active
- Since: 0.1.0
- Source: HAL-1540, step 7(c) of the HAL-186 plan

When a host builds the local engine, the engine shall build the local executor and the workspace's routine scheduler on one scheduler, giving each scheduler timer to the executor and each scheduler tick to the routine scheduler, so a routine that is due starts its run through the local executor and the run moves on from the scheduler's timers. The routine scheduler shall read the time from the executor's clock and tell which runs are still going from the executor's run store. When the host closes the engine, it shall stop starting routine runs, wait for a tick in progress, then close the scheduler if the scheduler can be closed. If the scheduler calls its listener before the engine is built, the call shall fail with an error, so the scheduler retries the timer and the next tick catches up.

## Examples

- Given a routine in the `acme` hub that runs the `reply` workflow every day at 08:00,
  when the scheduler ticks at 07:59:30 and again at 08:00:20,
  then the second tick starts the run with the routine's run id, and delivering the scheduler's timers completes it.
- Given a built local engine,
  when the host closes it and the scheduler ticks after a routine is due,
  then no run starts and the scheduler is closed.
- Given a scheduler that ticks while it is being made,
  when the host builds the local engine,
  then that tick fails with an error that says the engine is still starting.
