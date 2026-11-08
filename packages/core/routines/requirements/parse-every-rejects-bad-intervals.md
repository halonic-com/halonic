# routines.parse-every-rejects-bad-intervals

- Status: active
- Since: 0.1.0
- Source: `parseEvery` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

If an interval is not a count of 1 or more without leading zeros followed by `m`, `h` or `d`, then the parser shall throw a `CronError` with the message `"<text>" is not an interval. Use for example "15m", "1h" or "1d".`, where `<text>` is the interval as given.

## Examples

- Given `0m`, when it is parsed, then a `CronError` says `"0m" is not an interval. Use for example "15m", "1h" or "1d".`
- Given `05m`, when it is parsed, then a `CronError` is thrown (a leading zero).
- Given `15s` or `1w`, when it is parsed, then a `CronError` is thrown (an unknown unit).
- Given `15M`, `15 m` or `1.5h`, when it is parsed, then a `CronError` is thrown.
- Given `m` or `15`, when it is parsed, then a `CronError` is thrown (no count, or no unit).
- Given an empty text or only spaces, when it is parsed, then a `CronError` is thrown, and the message quotes the text as it was given.
