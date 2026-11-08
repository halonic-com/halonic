# check.trace-active-needs-passing-test

- Status: active
- Since: 0.1.0
- Source: HAL-107

If an active requirement has no test tagged with its ID that ran and passed in a result file, then the trace check shall fail on the requirement file.

## Examples

- Given an active requirement and a `verifies` test for it that passed,
  when the trace check runs,
  then it passes.
- Given an active requirement with no tests,
  when the trace check runs,
  then it fails with "has no test that ran".
- Given an active requirement whose tests failed or were skipped,
  when the trace check runs,
  then it fails with "none of them passed".
- Given a draft and a retired requirement without tests,
  when the trace check runs,
  then it passes.
