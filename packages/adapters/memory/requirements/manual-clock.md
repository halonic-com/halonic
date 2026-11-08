# adapter-memory.manual-clock

- Status: active
- Since: 0.1.0
- Source: HAL-114; old `784f78d:packages/core/util` `fixedClock` (a step clock; this one moves only when told)

The manual clock shall start at the time it is given (2026-01-01T00:00:00Z by default) and keep that time until `advance` or `set` moves it. When `advance` gets a negative or non-finite number, or `set` or the constructor gets a string that isn't a time, it shall throw a `RangeError` and keep its time.

## Examples

- Given a new manual clock,
  when `now()` is called twice,
  then both give 2026-01-01T00:00:00.000Z.
- Given that clock,
  when it advances 1500 ms,
  then `now()` gives 2026-01-01T00:00:01.500Z.
- Given a clock at 2026-05-01,
  when it is set to 2026-04-30,
  then `now()` gives 2026-04-30.
- Given a clock,
  when it advances -1 ms,
  then it throws a `RangeError` and its time is unchanged.
