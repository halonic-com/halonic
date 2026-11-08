# workflow.parse-duration-rejects-bad-durations

- Status: active
- Since: 0.1.0
- Source: `parseDuration` in the old workflow package (`packages/core/workflow/src/machine.ts`) at 784f78d

If the delay of a timer transition is not exactly a count of 1 or more without leading zeros followed by `m`, `h` or `d`, then the workflow rules shall throw an error with the message `Bad duration "<text>"`, where `<text>` is the delay as given.

## Examples

- Given `0m`, when it is parsed, then an error says `Bad duration "0m"`.
- Given `05m`, when it is parsed, then an error is thrown (a leading zero).
- Given `30s`, `1w`, `30M` or `1.5h`, when it is parsed, then an error is thrown (seconds, weeks, another case or a fraction).
- Given `m` or `30`, when it is parsed, then an error is thrown (no count, or no unit).
- Given an empty text, when it is parsed, then an error says `Bad duration ""`.
- Given `30m` with spaces around it, or `30 m`, when it is parsed, then an error is thrown: spaces are not ignored.
