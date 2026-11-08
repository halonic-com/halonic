# spec.type-test-marks-type-only

- Status: active
- Since: 0.1.0
- Source: HAL-461

When a test written with `typeTest(name, body)` has run a body that makes no runtime `expect` call, the spec package shall record one assertion for it, so it passes when tests must assert. If the body calls `expect`, then the spec package shall fail the test.

## Examples

- Given a `typeTest` whose body only calls `expectTypeOf`,
  when tests must assert,
  then the test passes with one assertion.
- Given a plain `it` with no assertion,
  when tests must assert,
  then the test still fails.
- Given a `typeTest` whose body calls `expect(1).toBe(1)`,
  when it runs,
  then the test fails and says to use `it`.
