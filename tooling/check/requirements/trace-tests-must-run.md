# check.trace-tests-must-run

- Status: active
- Since: 0.1.0
- Source: HAL-107 (Julian's review)

If a `verifies` call in a test file has no tests in its package's result file, or a package has tests but no result file or one that can't be read, then the trace check shall fail, so a test in a file the runner never collects can't count.

## Examples

- Given a test file with `verifies("workflow.timer-fires", …)` that is missing from the result file,
  when the trace check runs,
  then it fails on that file with "never ran".
- Given a package with test files and no `test-results/vitest.json`,
  when the trace check runs,
  then it fails once for the package with "has tests but no result file".
- Given a package whose `test-results/vitest.json` is cut short,
  when the trace check runs,
  then it fails once on that file with "can't be read" instead of stopping.
