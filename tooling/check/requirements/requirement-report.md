# check.requirement-report

- Status: active
- Since: 0.1.0
- Source: HAL-107

When `pnpm check trace --report` runs, the repo checks shall write a Markdown requirement report for every package with requirements, listing each requirement with its status, the result of its tests in the last run, its sentence, its examples and its tests.

## Examples

- Given `workflow.cron` with one passed and one failed test, `workflow.draft-idea` as a draft without tests and `workflow.timer` with one passed test,
  when the report is written,
  then its table shows "not passed (1 of 2)", "no tests ran" and "passed (1 of 1)", sorted by ID.
- Given requirements in `packages/core/workflow` and `packages/core/std`,
  when the reports are written,
  then each package gets its own report with only its requirements.
- Given a test named `x | y`, a line break and `z`,
  when the report is written,
  then the test is listed on one line as `x \| y z`.
