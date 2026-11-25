# engine.harness-hedge-wait

- Status: active
- Since: unreleased
- Source: HAL-18800, Liam's plan approval on HAL-18801; the early hedge's `sleep` from `retry-detectors.early-hedge` (HAL-18783)

When a harness call waits a number of milliseconds, as the early hedge does until its next checkpoint, the engine shall set one timer through the `Scheduler` port for that wait, due that many milliseconds from now, and the wait shall end once that timer arrives.

When the caller gives up on the wait before its timer arrives, the engine shall remove the timer, and the wait shall never end. A timer that still arrives after that shall change nothing.

If the scheduler doesn't take the timer, then the wait shall fail with the scheduler's error, unless the caller has already given up on it.

## Examples

- Given a harness call that waits 2 minutes at 10:00,
  when its timer arrives,
  then the wait ends, and the timer was set for 10:02.
- Given a harness call that waits 2 minutes and a second wait of 5 minutes started after it,
  when the caller gives up on the first wait and its timer arrives anyway,
  then neither wait ends, and the second wait's timer is still set.
- Given a scheduler that doesn't take timers,
  when a harness call waits,
  then the wait fails with the scheduler's error.
