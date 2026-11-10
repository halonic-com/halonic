# test-runner.list-tests

- Status: active
- Since: 0.1.0
- Source: `halonic test --list` and `--filter` in the CLI output design (HAL-1981, section 3.3), and `runWorkflowTests` in the old test runner (`packages/testing/test-runner/src/index.ts`) at 784f78d

When asked for a workspace's tests, the test runner shall list every case of every hub's workflow test file, in file order and then case order, each with its hub, workflow, name, file and the line of its `name` in the file when the file's text is given. A filter keeps only the cases whose hub, workflow and name each equal the filter's, exactly, for each part the filter sets; the CLI turns `--filter` into those parts (Liam, HAL-4224). A test file at the workspace root has no hub, so its cases are not listed.

The old runner ran the tests of one hub, optionally of one workflow, and had no list. The list and the name filter are new for `halonic test`.

## Examples

- Given a hub `billing` with `approval.test.yaml` holding "approve" and "one day is not enough", when the tests are listed, then both are listed in that order, with their lines.
- Given the name filter "one day is not enough", when the tests are listed, then only that case is listed; given "day" or "One day is not enough", none is.
- Given no file text, when the tests are listed, then the cases have no lines.
