# check.guard-mocks

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a pull request adds a `vi.mock` of a module inside a package to a test file of that package with `verifies(…)` tests, then the requirement guard shall report it under the test file's path.

## Examples

- Given a `verifies("workflow.timer-fires", …)` test file in the workflow package,
  when the pull request adds `vi.mock("./timer.ts")`,
  then the guard reports that the file mocks code of the package its requirements are about.
- Given the same file,
  when the pull request adds `vi.mock("node:fs")`,
  then the guard reports nothing.
