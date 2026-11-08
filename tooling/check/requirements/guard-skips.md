# check.guard-skips

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a pull request adds a way of skipping a test to a test file or a Vitest config, that is `.skip`, `.only`, `.todo`, `skipIf`, `runIf`, `ctx.skip()`, `test.fails` or a `retry` option, then the requirement guard shall report it under the file's path.

## Examples

- Given a test file without skips on the merge base,
  when the pull request changes a `test(…)` to `test.skip(…)`,
  then the guard reports that the file adds a skip: `.skip`.
- Given a test that passes `{ retry: 2 }` as its options,
  when the guard reads the file,
  then it reports a `retry option`.
- Given a test whose data holds a workflow's own `{ retry: 2 }` setting,
  when the guard reads the file,
  then it reports nothing.
