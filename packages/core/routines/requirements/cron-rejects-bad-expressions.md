# routines.cron-rejects-bad-expressions

- Status: active
- Since: 0.1.0
- Source: `parseCron` and its field parser in the old routines package (`packages/core/routines/src/cron.ts`) at 784f78d

If a cron expression is an unknown macro, doesn't have five fields, or a field holds something other than a number, a known name, a range or a step of 1 or more within the field's limits, then the parser shall throw a `CronError` whose message names the field (for example `Minute:`), the problem and the part that caused it, as a full sentence that ends with a full stop.

## Examples

- Given `* * * *`, when it is parsed, then the error says `Cron needs 5 fields (minute hour day month weekday), got 4.`
- Given an empty expression, when it is parsed, then the error says cron needs 5 fields.
- Given `60 * * * *`, when it is parsed, then the error says `Minute: "60" is outside 0-59.`
- Given `0 0 * * 5-1`, when it is parsed, then the error says `Weekday: "5-1" is outside 0-7.`
- Given `*/0 * * * *`, when it is parsed, then the error is about the step and names the minute field.
- Given `x * * * *`, when it is parsed, then the error says `Minute: "x" is not a number.`
- Given `/5 * * * *` or `1/2/3 * * * *`, when it is parsed, then the error says `Minute: "/5" is not a valid part.` (or the same for `"1/2/3"`).
- Given `1-/5 * * * *`, when it is parsed, then the error says `Minute: "1-" in "1-/5" is not a valid range.`
- Given `@reboot`, when it is parsed, then the error says `Unknown macro "@reboot".` and lists the known ones.
- Given `1-2-3 * * * *`, when it is parsed, then the error says `Minute: "1-2-3" is not a valid range.`
- Given `*/1e1 * * * *`, when it is parsed, then the error says `Minute: "*/1e1" needs a step that is a whole number of 1 or more.`

## Difference from the old routines package

The old parser read `1-2-3` as `1-2`, and read steps with `Number()`, so `*/1e1` meant every 10 minutes and `*/0x10` every 16. Both are now errors. The old parser also reported `1-/5` as `"" is not a number` and `@reboot` as having 1 field; both messages now name the problem. These are allowed differences: these are typing mistakes that cron elsewhere rejects, and quietly accepting them made a routine run at times nobody wrote down.
