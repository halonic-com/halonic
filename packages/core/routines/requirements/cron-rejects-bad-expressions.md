# routines.cron-rejects-bad-expressions

- Status: active
- Since: 0.1.0
- Source: `parseCron` and its field parser in the old routines package (`packages/core/routines/src/cron.ts`) at 784f78d

If a cron expression doesn't have five fields, or a field holds something other than a number, a known name, a range or a step of 1 or more within the field's limits, then the parser shall throw a `CronError` whose message names the problem and the part that caused it.

## Examples

- Given `* * * *`, when it is parsed, then the error says cron needs 5 fields and got 4.
- Given an empty expression, when it is parsed, then the error says cron needs 5 fields.
- Given `60 * * * *`, when it is parsed, then the error says `"60" is outside 0-59`.
- Given `0 0 * * 5-1`, when it is parsed, then the error says `"5-1"` is outside 0-7.
- Given `*/0 * * * *`, when it is parsed, then the error is about the step.
- Given `x * * * *`, when it is parsed, then the error says `"x" is not a number`.
- Given `/5 * * * *` or `1/2/3 * * * *`, when it is parsed, then the error says it is a bad part and names it.
- Given `1-/5 * * * *`, when it is parsed, then the error says the empty end of the range is not a number.
- Given `1-2-3 * * * *`, when it is parsed, then the error says it is a bad range.
- Given `*/1e1 * * * *`, when it is parsed, then the error is about the step.

## Difference from the old routines package

The old parser read `1-2-3` as `1-2`, and read steps with `Number()`, so `*/1e1` meant every 10 minutes and `*/0x10` every 16. Both are now errors. This is an allowed difference: these are typing mistakes that cron elsewhere rejects, and quietly accepting them made a routine run at times nobody wrote down.
