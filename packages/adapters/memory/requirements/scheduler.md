# memory.scheduler

- Status: active
- Since: 0.1.0
- Source: HAL-114; `Scheduler` port v1; multi-cloud ADR 5.3 and 9

The memory scheduler shall deliver timers and ticks only when its owner calls `runDue`, reading the time from the clock it was given, so tests decide when time passes. By default it shall deliver each timer exactly once. When it is created with `duplicateDeliveries`, it shall deliver every timer a second time after the first call resolves. When a timer's time isn't a valid time, `schedule` shall reject with a `RangeError`.

## Examples

- Given a timer due now,
  when `runDue` is called, then the clock moves 15 minutes and `runDue` is called again,
  then the listener got the timer once.
- Given a timer due now,
  when the clock moves a minute but `runDue` isn't called,
  then nothing is delivered.
- Given a scheduler with `duplicateDeliveries` and a due timer,
  when `runDue` is called,
  then the listener gets the same timer twice and the timer is gone.
- Given `schedule("run_1", "wait", "soon")`,
  when it is called,
  then it rejects with a `RangeError`.
