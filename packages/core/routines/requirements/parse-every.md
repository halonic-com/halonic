# routines.parse-every

- Status: active
- Since: 0.1.0
- Source: `parseEvery` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

When an interval written as a count of 1 or more without leading zeros followed by `m` (minutes), `h` (hours) or `d` (days) is parsed, the parser shall ignore the whitespace around it and return the count times the unit's length in milliseconds.

## Examples

- Given `15m`, when it is parsed, then the result is 900,000 (15 minutes).
- Given `2h`, when it is parsed, then the result is 7,200,000 (2 hours).
- Given `1d`, when it is parsed, then the result is 86,400,000 (1 day).
- Given `30m` with a space before and after it, when it is parsed, then the result is 1,800,000, the same as `30m`.
- Given any count n of 1 or more and any of the three units, when `<n><unit>` is parsed, then the result is n times the unit's length.
