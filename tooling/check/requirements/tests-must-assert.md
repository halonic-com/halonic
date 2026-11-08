# check.tests-must-assert

- Status: active
- Since: 0.1.0
- Source: HAL-118

The shared Vitest preset shall fail a test that makes no assertion, and Biome shall reject skipped and focused tests, so a test can't be emptied out or switched off to pass.

## Examples

- Given a package whose `vitest.config.ts` uses the shared preset,
  when a test in it calls no `expect`,
  then the test fails.
- Given a test file with `test.skip` or `test.only`,
  when Biome lints it,
  then lint fails.
