# workflow.parse-duration

- Status: active
- Since: 0.1.0
- Source: `parseDuration` in the old workflow package (`packages/core/workflow/src/machine.ts`) at 784f78d

When the delay of a timer transition, written as a count of 1 or more without leading zeros followed by `m` (minutes), `h` (hours) or `d` (days), is parsed, the workflow rules shall return the count times the unit's length in milliseconds.

## Examples

- Given `30m`, when it is parsed, then the result is 1,800,000 (30 minutes).
- Given `4h`, when it is parsed, then the result is 14,400,000 (4 hours).
- Given `2d`, when it is parsed, then the result is 172,800,000 (2 days).
- Given any count n of 1 or more and any of the three units, when `<n><unit>` is parsed, then the result is n times the unit's length.
