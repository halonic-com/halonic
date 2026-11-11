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
 * requirement guard can see a requirement's tests assert less.
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
    beforeEach(countLastAttempt);
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

/** The `expect` counts of the global `expect` and the test's own. */
interface Counts {
  readonly local: number;
  readonly global: number;
}

/**
 * HAL-6369: `vi.waitFor` runs its callback again until it passes, so the
 * `expect` count would depend on how fast the runner was. For the test's
 * run, `vi.waitFor` counts only the calls of the attempt that passed, as
 * if the callback ran once. (`expect.poll` already counts once.) The
 * cleanup puts the original back after the test.
 */
function countLastAttempt(context: TestContext): () => void {
  // Vitest creates the test's own `expect` on first use, and from then on
  // checks only its count for `requireAssertions`. So it is read only once
  // the test has used it (Vitest's `_local` flag); unused, it counts 0.
  const ownExpect = (): TestContext["expect"] | undefined =>
    (context as { _local?: boolean })._local === true ? context.expect : undefined;
  const counts = (): Counts => ({
    local: ownExpect()?.getState().assertionCalls ?? 0,
    global: expect.getState().assertionCalls,
  });
  const original = vi.waitFor;
  vi.waitFor = async (callback, options) => {
    const start = counts();
    let passed: Counts = { local: 0, global: 0 };
    const attempt = (): ReturnType<typeof callback> => {
      const before = counts();
      const since = (): Counts => {
        const now = counts();
        return { local: now.local - before.local, global: now.global - before.global };
      };
      const result = callback();
      if (isThenable(result)) {
        return Promise.resolve(result).then((value) => {
          passed = since();
          return value;
        });
      }
      passed = since();
      return result;
    };
    const value = await original(attempt, options);
    ownExpect()?.setState({ assertionCalls: start.local + passed.local });
    expect.setState({ assertionCalls: start.global + passed.global });
    return value;
  };
  return () => {
    vi.waitFor = original;
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
