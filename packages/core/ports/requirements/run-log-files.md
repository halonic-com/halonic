# ports.run-log-files

- Status: active
- Since: 0.1.0
- Source: HAL-2701 (the desktop app's run store shares the CLI's run folder); the log and run id rules moved from `fs-node` so `fs-tauri` shares them, as `ports.run-store-checks` did on HAL-1635

The ports package shall export the run folder's file rules, so every adapter that keeps runs as files reads and refuses the same logs and run ids. `formatLogLines` shall write each event as one JSON line ending in a line break. `parseLogLines` shall read a log's whole lines back into events, throw an error naming the file and line for a line that isn't the run's next event, and throw a `RangeError` for text that doesn't end in a line break, since leaving out a torn last line is the adapter's job. `checkRunId` shall throw a `RangeError` for a run id that is not 1 to 128 letters, digits, `_`, `-` or `.`, starts with a dot, or is a Windows device name with or without an extension.

## Examples

- Given the lines `formatLogLines` wrote for events 1 and 2 of `r1`,
  when they are read with `parseLogLines`,
  then it gives both events.
- Given one whole line and a last line without a line break,
  when they are read with `parseLogLines`,
  then it throws a `RangeError`.
- Given a second line that holds event 2 of run `r2`,
  when the log of `r1` is read,
  then it throws an error naming the file and line 2.
- Given run id `../r1`, `.hidden`, `NUL.jsonl` or one of 129 characters,
  when `checkRunId` is called,
  then it throws a `RangeError`, and `r1` and `com10` pass.
