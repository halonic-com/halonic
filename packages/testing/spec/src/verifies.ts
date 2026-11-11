import { afterEach, beforeEach, describe, expect, type TestContext, vi } from "vitest";

/**
 * A requirement ID: `<package>[.<sub-feature>].<name>`, each part a short
 * kebab-case word, for example `workflow.timer-fires-after-delay`.
 */
export const requirementIdPattern =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;

declare module "vitest" {
  interface TaskMeta {
    /** The requirement the test proves, set by `verifies()`. The trace check reads it. */
    requirement?: string;
    /** How many `expect` calls the test made, set by `verifies()`. The requirement guard reads it. */
    assertions?: number;
  }
}

// describe() runs its body at once while Vitest collects the file, so a
// plain flag is enough to notice one verifies() inside another.
let insideVerifies = false;

/**
 * Groups the tests that prove one requirement. It is `describe`
 * with the requirement ID as its title, and it tags every test inside with
 * the ID, so Vitest's result file says which requirements ran and passed.
 * It also records how many `expect` calls each test made, so the
 * requirement guard can see a requirement's tests assert less. Inside
 * `vi.waitFor` only the passing attempt counts, so the count doesn't depend
 * on how often the callback had to retry.
 *
 * @param requirementId - the ID from the requirement file, such as `workflow.timer-fires-after-delay`
 * @param body - the tests, written as in `describe`
 * @throws when the ID is not a valid requirement ID, or when `verifies` is nested in another `verifies`
 *
 * @example
 * verifies("workflow.timer-fires-after-delay", () => {
 *   test("fires once the delay has passed", () => { … });
 * });
 */
export function verifies(requirementId: string, body: () => void): void {
  if (!requirementIdPattern.test(requirementId)) {
    throw new Error(
      `"${requirementId}" is not a requirement ID. Use <package>[.<sub-feature>].<name> in kebab-case, matching the requirement file's folder.`,
    );
  }
  if (insideVerifies) {
    throw new Error(
      `verifies("${requirementId}") is inside another verifies(). Each test proves one requirement, so put them side by side.`,
    );
  }
  describe(requirementId, { meta: { requirement: requirementId } }, () => {
    insideVerifies = true;
    beforeEach(countPassingWaitForOnly);
    afterEach(recordAssertions);
    try {
      body();
    } finally {
      insideVerifies = false;
    }
  });
}

/**
 * Writes the test's `expect` count into its tag. A test counts with either
 * the global `expect` or its own `({ expect })`, so both are added up.
 * afterEach runs before Vitest resets the counts for the next test.
 */
function recordAssertions(context: TestContext): void {
  const local = context.expect.getState().assertionCalls;
  const global = expect.getState().assertionCalls;
  context.task.meta.assertions = local + global;
}

/**
 * Makes `vi.waitFor` drop the `expect` calls of each attempt that throws, so
 * a retried `vi.waitFor(() => expect(…))` counts like one `expect` (HAL-6239).
 * Returns the teardown that puts the original `vi.waitFor` back.
 */
function countPassingWaitForOnly(context: TestContext): () => void {
  const original = vi.waitFor;
  vi.waitFor = (callback, options) =>
    original(() => {
      // Reading context.expect creates the test's own expect, and Vitest then
      // checks only that one's count. So touch it only when the test uses it.
      const own = (context as { _local?: boolean })._local === true ? context.expect : undefined;
      const local = own?.getState().assertionCalls ?? 0;
      const global = expect.getState().assertionCalls;
      // An attempt still pending when vi.waitFor times out can reject later and
      // reset the count of the test running then. The timed-out test has
      // already failed, so that can't hide a failure.
      const forget = (error: unknown): never => {
        own?.setState({ assertionCalls: local });
        expect.setState({ assertionCalls: global });
        throw error;
      };
      try {
        const result = callback();
        return result instanceof Promise ? result.catch(forget) : result;
      } catch (error) {
        return forget(error);
      }
    }, options);
  return () => {
    vi.waitFor = original;
  };
}
