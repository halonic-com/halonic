# std.clock

- Status: active
- Since: 0.1.0
- Source: the old util package (`packages/core/util`) `systemClock` and `fixedClock` at 784f78d

The system clock shall return the machine's current time, and a fixed clock shall return its start time on the first call and move on by its step on each later call.

## Examples

- Given a fixed clock with no arguments, when `now()` is called twice, then the times are 2026-01-01T00:00:00Z and 2026-01-01T00:00:01Z.
- Given a fixed clock starting at 0 with a step of 250 ms, when `now()` is called three times, then the times are 0, 250 and 500 ms.
- Given two fixed clocks, when one is called, then the other still starts at its own start time.
- Given a step of -1 or a start of `NaN`, when the fixed clock is created, then an `AssertionError` says which argument is wrong.
- Given the system clock, when `now()` is called, then the time lies between `Date.now()` before and after the call.
