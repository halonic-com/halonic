import {
  afterEach,
  beforeEach,
  describe,
  type ExpectStatic,
  expect,
  type TestContext,
  vi,
} from "vitest";

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

// The running test's context, so a failed vi.waitFor attempt can take back
// the calls on the test's own `({ expect })` too.
let runningTest: TestContext | undefined;

/**
 * Groups the tests that prove one requirement. It is `describe`
 * with the requirement ID as its title, and it tags every test inside with
 * the ID, so Vitest's result file says which requirements ran and passed.
 * It also records how many `expect` calls each test made, so the
 * requirement guard can see a requirement's tests assert less. Only the
 * attempt of a `vi.waitFor` that passed counts, so the number doesn't depend
 * on how often the wait retried.
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
  countOnlyPassingWaitForAttempts();
  describe(requirementId, { meta: { requirement: requirementId } }, () => {
    insideVerifies = true;
    beforeEach((context) => {
      runningTest = context;
    });
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
  runningTest = undefined;
}

/** Marks a `vi.waitFor` that already takes back failed attempts' calls. */
const wrappedWaitFor = Symbol("verifies wraps vi.waitFor");

/**
 * Makes `vi.waitFor` take back the `expect` calls of every attempt that
 * failed. Each retry calls the callback again, so an `expect` inside it would
 * count once per retry, and the count would change with the machine's speed
 * (HAL-6258). Wraps `vi.waitFor` once per Vitest instance.
 */
function countOnlyPassingWaitForAttempts(): void {
  if (wrappedWaitFor in vi.waitFor) {
    return;
  }
  const original = vi.waitFor;
  const waitFor: typeof vi.waitFor = (callback, options) =>
    original(() => attempt(callback), options);
  vi.waitFor = Object.assign(waitFor, { [wrappedWaitFor]: true });
}

/** Runs one attempt of a `vi.waitFor` callback, and takes back its calls if it fails. */
function attempt<T>(callback: () => T | Promise<T>): T | Promise<T> {
  const takeBack = takeBackCallsSince(ownExpectOf(runningTest));
  try {
    const result = callback();
    if (result instanceof Promise) {
      return result.catch((error: unknown) => {
        takeBack();
        throw error;
      });
    }
    return result;
  } catch (error) {
    takeBack();
    throw error;
  }
}

/**
 * The test's own `expect`, if the test has used it. Vitest creates it on first
 * read and from then on checks the test's assertions on it instead of the
 * global one, so reading it here would fail a test that only uses the global
 * `expect`. Its internal `_local` flag says whether it exists yet.
 */
function ownExpectOf(context: TestContext | undefined): ExpectStatic | undefined {
  return context !== undefined && Reflect.get(context, "_local") === true
    ? context.expect
    : undefined;
}

/** Remembers the counts now, and returns a function that sets them back. */
function takeBackCallsSince(own: ExpectStatic | undefined): () => void {
  const counters = own === undefined ? [expect] : [expect, own];
  const before = counters.map((counter) => ({
    counter,
    calls: counter.getState().assertionCalls,
  }));
  return () => {
    for (const { counter, calls } of before) {
      counter.setState({ assertionCalls: calls });
    }
  };
}
