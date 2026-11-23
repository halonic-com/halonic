# check.guard-golden-files

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a pull request changes, adds or deletes a golden file or snapshot, that is a file in a `golden/` or `__snapshots__/` folder, a `.snap` file, a public API's spec file (a `.schema.json` file under a `spec/` folder), or an inline snapshot in a test file, then the requirement guard shall report it under the file's path, except a released spec (`spec/released/<version>/<name>.schema.json`) the pull request adds with the same text as its package's current `spec/<name>.schema.json`, where `<version>` is the version `pnpm version:sync` releases it under: the owning package's `version` in the pull request, or the Studio app's version for a package without one.

## Examples

- Given `golden/run-log.txt` on the merge base,
  when the pull request changes one line of it,
  then the guard reports that the golden file was changed.
- Given a test with `toMatchInlineSnapshot("1")`,
  when the pull request changes it to `toMatchInlineSnapshot("2")`,
  then the guard reports that the test file changes an inline snapshot.
- Given `spec/agent.schema.json` on the merge base,
  when the pull request changes it,
  then the guard reports that the golden file was changed.
- Given `spec/agent.schema.json` on the merge base and a package at version `0.4.0`,
  when the pull request adds `spec/released/0.4.0/agent.schema.json` with the same text,
  then the guard reports nothing; with other text, it reports that the golden file was added.
- Given the same package at version `0.4.0`,
  when the pull request adds `spec/released/9.9.9/agent.schema.json` with the same text as the current spec,
  then the guard reports that the golden file was added.
