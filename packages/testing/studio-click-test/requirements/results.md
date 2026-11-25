# studio-click-test.results

- Status: active
- Since: unreleased
- Source: HAL-18317 (plan approved by Liam, 25 Nov), HAL-18353 (the board's direction, 25 Nov: don't stop at the first failure)

The click test shall run every step in order and save a screenshot after each step that ran. After a failing step it shall restart the app and go on with the next step, mark a step whose needed step didn't pass as "skipped", and write a pass/fail table that names every failing step and its code.

## Examples

- Given three steps where the second fails with `LIST_FAILED`,
  then the app restarts once, the table reads passed, failed (`LIST_FAILED`), passed, and screenshots `01-…` to `03-…` exist.
- Given a step that needs a step that failed,
  then it is "skipped" with "needs step N", and doesn't run.
- Given the app doesn't restart after a failure,
  then the steps after it are "not run", with the reason.
- Given a step that throws, such as a lost WebDriver session,
  then it fails as `STEP_ERROR` with the message, so the table never blames the app for a driver error.
- Given every step passed,
  then the table says so and the run exits 0; otherwise it exits 1.
