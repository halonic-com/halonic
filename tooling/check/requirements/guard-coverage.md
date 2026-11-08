# check.guard-coverage

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3, point 3)

If a pull request lowers a package's coverage floor, adds a coverage-ignore comment or changes the `coverage` settings of a Vitest config or the shared preset, then the requirement guard shall report it under the changed file's path.

## Examples

- Given a package whose floor is 90% of lines,
  when the pull request sets it to 80,
  then the guard reports that the floor for lines went from 90 to 80.
- Given a source file without coverage-ignore comments,
  when the pull request adds `/* v8 ignore next */`,
  then the guard reports the new comment and its line.
- Given a `vitest.config.ts` with coverage settings,
  when the pull request adds a file to `coverage.exclude`,
  then the guard reports that the file changes the coverage settings.
