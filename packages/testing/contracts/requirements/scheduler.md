# contracts.scheduler

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `Scheduler` port v1; multi-cloud ADR 5.3 (timers arrive late or twice)

Where an adapter implements `Scheduler`, it shall deliver a timer at least once when it is due and never before, with the time it was set for (also when it arrives late); a timer may arrive more than once, so the suite never counts repeats. It shall treat a time in the past as due at once, move a timer that is set again to its new time (never delivering it at the old one), drop a cancelled timer (cancelling a missing one is not an error) and list a key's timers earliest first. When the listener rejects, it shall deliver the timer again at least 1 second later, doubling the wait each time up to at most 15 minutes, and never drop it. A timer the listener sets again during a call shall stay as set, whether the call resolves or rejects, and a timer it cancels shall be gone. It shall tick about once a minute, and a tick that rejects shall stop nothing. When a key or timer id is longer than 256 UTF-8 bytes, `schedule` shall reject with a `RangeError`.

## Examples

- Given a timer set for 5 seconds from now,
  when 4 seconds pass,
  then nothing is delivered, and after 5 seconds it is delivered (once or more) with its set time.
- Given a timer set for 1 second from now,
  when 10 minutes pass,
  then it is delivered with the time 1 second from the start.
- Given a listener that rejects the first three calls,
  when the clock moves 1, 2 and 4 seconds after each failure,
  then the timer comes again each time, and not a millisecond earlier (repeats at the same moment don't count as a new try).
- Given a listener that rejects 12 times,
  when the clock moves by the retry wait each time,
  then no wait is longer than 15 minutes and the 13th call ends the timer.
- Given a listener that sets the timer again for 10 minutes later and then rejects,
  when 1 second passes,
  then nothing is delivered and the timer is pending for 10 minutes later.
- Given a key of 129 `é` characters (258 bytes),
  when it is scheduled,
  then it rejects with a `RangeError`, and a key of 128 `é` (256 bytes) is accepted.
