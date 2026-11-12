# check.guard-base-after-walk-back

- Status: active
- Since: 0.1.0
- Source: HAL-7660

When main is red and CI takes the requirement guard's test results from an older green commit on main, the guard shall still compare the pull request's files with the main commit its merge ref was built on, and shall leave out the tests in files main changed between the two, so it reports only the pull request's own changes.

## Examples

- Given a pull request built on main commit B, whose tests fail, and the older green commit A,
  when main edited a requirement and removed tests from a test file between A and B,
  then the guard reports neither.
- Given the same pull request,
  when it removes a test from a test file main didn't change, or edits a requirement itself,
  then the guard reports it.
