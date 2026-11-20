# check.trace-tests-name-live-requirements

- Status: active
- Since: 0.1.0
- Source: HAL-107, HAL-12539

If a test names a requirement that doesn't exist or is retired, or names it with something other than a plain string, then the trace check shall fail on the test file. With `--package`, it shall look the requirement up in every package, not only those in scope.

## Examples

- Given `verifies("workflow.timer-fires", …)` and no such requirement file,
  when the trace check runs,
  then it fails with "doesn't exist".
- Given `verifies("workflow.timer-fires", …)` and that requirement retired,
  when the trace check runs,
  then it fails with "names the retired requirement".
- Given `verifies(someId, …)`,
  when the trace check runs,
  then it fails with "needs the requirement ID as a plain string".
- Given `verifies` imported under another name, or a tagged test in the result file the source scan can't see,
  when its ID doesn't exist,
  then the trace check fails on that test file.
- Given `--package packages/core/routines` and a test there that verifies a live requirement of `packages/core/workflow`,
  when the trace check runs,
  then it doesn't report the requirement as missing.
