# scenario.eventually

- Status: active
- Since: 0.1.0
- Source: HAL-1666; Docker research point 7 (HAL-1600), approved on HAL-1649

When `eventually(check, options)` is called, the scenario package shall run `check` at once and, while it throws, wait `every` milliseconds with the given `wait` function and run it again, and shall resolve with the value of the first check that doesn't throw. It shall count only the time waited towards `within`, so it runs at most `floor(within / every) + 1` checks. When no check passes within that budget, it shall reject with an error that names the intent and the number of checks and has the last check's error as its `cause`. When `every` isn't a finite number above 0, or `within` is less than `every` or not finite, it shall reject with a `RangeError` without running `check`.

## Examples

- Given a check that passes at once,
  when `eventually` runs it,
  then it resolves with the check's value and never waits.
- Given a check that passes on its third run and `every` of 1000,
  when `eventually` runs it,
  then it waits 1000 ms twice and resolves with the third run's value.
- Given a check that always throws, `within` 1000 and `every` 300,
  when `eventually` runs it,
  then it runs the check 4 times and rejects with "4 checks" and the fourth error as its cause.
- Given `every` of 0,
  when `eventually` is called,
  then it rejects with a `RangeError` and the check never runs.
