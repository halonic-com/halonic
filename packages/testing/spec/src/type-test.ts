import { expect, test } from "vitest";

/**
 * A test whose checks are all `expectTypeOf` or `assertType`. Those checks do
 * nothing when the test runs: the real check is `tsc -p tsconfig.test.json`,
 * which each package runs in `typecheck`. A test with no assertion fails
 * under `requireAssertions`, so `typeTest` records one marker assertion
 * once the body has run, and the test shows up as type-only.
 *
 * Only use it for type-only tests. A test with any runtime behaviour must use
 * `it`, so `typeTest` fails when its body calls `expect`. Inside `verifies()`
 * it is tagged with the requirement like any other test.
 *
 * @param name - the test name, as in `it`
 * @param body - the type checks
 * @throws when the body makes a runtime `expect` call
 *
 * @example
 * verifies("events.run-log-contract", () => {
 *   typeTest("has exactly the reference event types", () => {
 *     expectTypeOf<RunEventType>().toEqualTypeOf<"run.started" | …>();
 *   });
 * });
 */
export function typeTest(name: string, body: () => void): void {
  test(name, () => runTypeChecks(name, body));
}

/** Runs a `typeTest` body and records its marker assertion. Exported for the self-test. */
export function runTypeChecks(name: string, body: () => void): void {
  const before = expect.getState().assertionCalls;
  body();
  const after = expect.getState().assertionCalls;
  if (after !== before) {
    throw new Error(
      `typeTest("${name}") calls expect at runtime. typeTest is only for expectTypeOf and assertType checks, so use it() instead.`,
    );
  }
  expect.setState({ assertionCalls: after + 1 });
}
