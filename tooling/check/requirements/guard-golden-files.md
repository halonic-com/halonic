# check.guard-golden-files

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a pull request changes, adds or deletes a golden file or snapshot, that is a file in a `golden/` or `__snapshots__/` folder or a `.snap` file, or an inline snapshot in a test file, then the requirement guard shall report it under the file's path.

## Examples

- Given `golden/run-log.txt` on the merge base,
  when the pull request changes one line of it,
  then the guard reports that the golden file was changed.
- Given a test with `toMatchInlineSnapshot("1")`,
  when the pull request changes it to `toMatchInlineSnapshot("2")`,
  then the guard reports that the test file changes an inline snapshot.
