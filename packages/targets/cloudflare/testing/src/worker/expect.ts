import { deepEqual } from "./equality.ts";
import { containsMatch } from "./partial-match.ts";

/**
 * The `expect` of the vitest shim. It has only the matchers the contract
 * suites bundled into the test Worker use; `matcherNames` lists them, and the
 * test Worker's build fails when a suite calls one that isn't here (it uses
 * `missingShimApis`). Add a matcher here when a suite needs it, with rows in
 * `expect-parity.test.ts`.
 */

/** The counters Vitest keeps per test; `verifies()` and `typeTest()` read and write them. */
export interface ExpectState {
  assertionCalls: number;
}

/** A class such as `RangeError`, for `toThrow(RangeError)`. */
export type ErrorClass = abstract new (...args: never[]) => unknown;

/** What `toThrow` accepts: a message part, a pattern, an error class or an equal error. */
export type ThrowExpectation = string | RegExp | ErrorClass | Error;

/** The checks on one value. Each throws when the check fails. */
export interface Matchers {
  /** Same value, compared with `Object.is`. */
  toBe(expected: unknown): void;
  /** Deeply equal, ignoring properties that are `undefined`. */
  toEqual(expected: unknown): void;
  /** An object or array that contains everything `expected` describes; see `containsMatch`. */
  toMatchObject(expected: object): void;
  /** A string, array or other value whose `length` is `expected`. */
  toHaveLength(expected: number): void;
  /** A number at or above `expected`. */
  toBeGreaterThanOrEqual(expected: number | bigint): void;
  /** Exactly `null`. */
  toBeNull(): void;
  /** Exactly `undefined`. */
  toBeUndefined(): void;
  /** A function that throws, or under `rejects` a promise that rejects, with what `expected` describes. */
  toThrow(expected?: ThrowExpectation): void;
}

/** The same checks on what a promise rejected with; each returns a promise to await. */
export type PromiseMatchers = {
  [Name in keyof Matchers]: (...args: Parameters<Matchers[Name]>) => Promise<void>;
};

/** The value under test, with its matchers, the negated ones under `not` and the async ones under `rejects`. */
export type Assertion = Matchers & {
  readonly not: Matchers;
  readonly rejects: PromiseMatchers & { readonly not: PromiseMatchers };
};

/** The shim's `expect`: a function plus the state calls Vitest's `expect` has. */
export interface ShimExpect {
  /** The `message` comes first in a failure, as in Vitest. */
  (actual: unknown, message?: string): Assertion;
  /** The current counters. */
  getState(): ExpectState;
  /** Overwrites some of the counters. */
  setState(state: Partial<ExpectState>): void;
}

/** One matcher: whether `actual` passes, and how to describe it in a failure. */
interface MatcherCheck {
  readonly pass: boolean;
  readonly expectation: string;
}

/** Where `actual` came from: the value passed to `expect`, or what a promise rejected with. */
interface MatcherContext {
  readonly rejected: boolean;
}

type MatcherImplementation = (
  actual: unknown,
  expected: unknown,
  context: MatcherContext,
) => MatcherCheck;

const matchers: Record<keyof Matchers, MatcherImplementation> = {
  toBe: (actual, expected) => ({
    pass: Object.is(actual, expected),
    expectation: `to be ${describeValue(expected)}`,
  }),
  toEqual: (actual, expected) => ({
    pass: deepEqual(actual, expected),
    expectation: `to equal ${describeValue(expected)}`,
  }),
  toMatchObject: (actual, expected) => ({
    pass: isObject(actual) && isObject(expected) && containsMatch(actual, expected),
    expectation: `to match object ${describeValue(expected)}`,
  }),
  toHaveLength: (actual, expected) => ({
    pass: lengthOf(actual) === expected,
    expectation: `to have length ${describeValue(expected)}`,
  }),
  toBeGreaterThanOrEqual: (actual, expected) => ({
    pass: requireComparable(actual, "actual") >= requireComparable(expected, "expected"),
    expectation: `to be greater than or equal to ${describeValue(expected)}`,
  }),
  toBeNull: (actual) => ({ pass: actual === null, expectation: "to be null" }),
  toBeUndefined: (actual) => ({ pass: actual === undefined, expectation: "to be undefined" }),
  toThrow: (actual, expected, context) => {
    const outcome = context.rejected
      ? { threw: true, thrown: actual }
      : callAndCatch(actual, expected as ThrowExpectation | undefined);
    return {
      pass:
        outcome.threw && thrownMatches(outcome.thrown, expected as ThrowExpectation | undefined),
      expectation: `to throw ${expected === undefined ? "an error" : describeValue(expected)}`,
    };
  },
};

/** The names of the matchers the shim has, for the build's check. */
export const matcherNames: readonly string[] = Object.keys(matchers);

/** The thrown error when a check fails, named like Vitest's so messages read the same. */
export class AssertionError extends Error {
  override readonly name = "AssertionError";
}

/**
 * Creates an `expect` with its own counters. The shim keeps one global
 * `expect` and gives every test a fresh one in its context, as Vitest does.
 *
 * @returns a new `expect`
 */
export function createExpect(): ShimExpect {
  const state: ExpectState = { assertionCalls: 0 };
  const expect = (actual: unknown, message?: string): Assertion => {
    state.assertionCalls += 1;
    const subject = { actual, message, rejected: false };
    return {
      ...bindMatchers(subject, false),
      not: bindMatchers(subject, true),
      // A getter, as in Vitest: only `expect(x).rejects` needs `x` to be a promise.
      get rejects() {
        return bindRejectionMatchers(subject);
      },
    };
  };
  expect.getState = (): ExpectState => ({ ...state });
  expect.setState = (update: Partial<ExpectState>): void => {
    Object.assign(state, update);
  };
  return expect;
}

/** The value a matcher checks, with the message for a failure and where the value came from. */
interface Subject extends MatcherContext {
  readonly actual: unknown;
  readonly message: string | undefined;
}

function bindMatchers(subject: Subject, negated: boolean): Matchers {
  const bound: Partial<Record<keyof Matchers, (expected?: unknown) => void>> = {};
  for (const name of Object.keys(matchers) as (keyof Matchers)[]) {
    bound[name] = (expected?: unknown) => {
      const check = matchers[name](subject.actual, expected, subject);
      if (check.pass === negated) {
        const not = negated ? "not " : "";
        throw new AssertionError(
          `${prefixOf(subject)}expected ${describeValue(subject.actual)} ${not}${check.expectation}`,
        );
      }
    };
  }
  return bound as Matchers;
}

/** The caller's message before a failure, as Vitest puts it: `message: expected …`. */
function prefixOf(subject: Subject): string {
  return subject.message === undefined ? "" : `${subject.message}: `;
}

/**
 * The matchers under `rejects`: each waits for the promise, fails when it
 * resolves, and otherwise checks what it rejected with. Like Vitest, it
 * calls a function to get the promise.
 */
function bindRejectionMatchers(subject: Subject): PromiseMatchers & { not: PromiseMatchers } {
  const promise: unknown = typeof subject.actual === "function" ? subject.actual() : subject.actual;
  if (!isPromiseLike(promise)) {
    throw new TypeError(
      `You must provide a Promise to expect() when using .rejects, not '${typeof promise}'.`,
    );
  }
  const settle = (): Promise<Subject> =>
    Promise.resolve(promise).then(
      (value) => {
        throw new AssertionError(
          `${prefixOf(subject)}promise resolved ${describeValue(value)} instead of rejecting`,
        );
      },
      (reason: unknown) => ({ ...subject, actual: reason, rejected: true }),
    );
  const bindAsync = (negated: boolean): PromiseMatchers => {
    const bound: Partial<Record<keyof Matchers, (expected?: unknown) => Promise<void>>> = {};
    for (const name of Object.keys(matchers) as (keyof Matchers)[]) {
      bound[name] = async (expected?: unknown) => {
        const matcher = bindMatchers(await settle(), negated)[name] as (expected?: unknown) => void;
        matcher(expected);
      };
    }
    return bound as PromiseMatchers;
  };
  return { ...bindAsync(false), not: bindAsync(true) };
}

/**
 * Calls what `toThrow` was given and records what it threw. Like Vitest, a
 * value that isn't a function fails even under `not` when `expected` is
 * absent, a string or a pattern. With a class or an error, Vitest calls it
 * anyway, and the `TypeError` from that call counts as what it threw.
 */
function callAndCatch(
  actual: unknown,
  expected: ThrowExpectation | undefined,
): { threw: boolean; thrown: unknown } {
  const checksMessage =
    expected === undefined || typeof expected === "string" || expected instanceof RegExp;
  if (checksMessage && typeof actual !== "function") {
    throw new AssertionError(`expected ${describeValue(actual)} to be a function`);
  }
  try {
    (actual as () => unknown)();
    return { threw: false, thrown: undefined };
  } catch (thrown) {
    return { threw: true, thrown };
  }
}

/** Whether a thrown value is what `toThrow`'s argument describes, by Vitest's rules. */
function thrownMatches(thrown: unknown, expected: ThrowExpectation | undefined): boolean {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected === "string") {
    return messageOf(thrown).includes(expected);
  }
  if (expected instanceof RegExp) {
    return expected.test(messageOf(thrown));
  }
  if (typeof expected === "function") {
    return thrown instanceof expected;
  }
  return deepEqual(thrown, expected);
}

/** An error's message, or the thrown value itself as text. */
function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Returns `value` when it is a number or a bigint and throws a `TypeError`
 * otherwise, before any `not` is applied, as Vitest's matcher does. A plain
 * failed check would turn into a pass under `not`.
 */
function requireComparable(value: unknown, role: "actual" | "expected"): number | bigint {
  if (typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  throw new TypeError(`${role} value must be number or bigint, received ${describeValue(value)}`);
}

/** Vitest fails `toMatchObject` on a value that isn't an object, and `not` turns that into a pass. */
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * The `length` of a string, array or the like. A value without a numeric one
 * fails even under `not`, as in Vitest. (Vitest also takes a `length` that is
 * a numeric string; the shim doesn't.)
 */
function lengthOf(value: unknown): number {
  if (value === null || value === undefined) {
    throw new AssertionError("Target cannot be null or undefined.");
  }
  const length = (value as { length?: unknown }).length;
  if (typeof length !== "number") {
    throw new AssertionError(`expected ${describeValue(value)} to have property 'length'`);
  }
  return length;
}

function describeValue(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : `Date(${value.toISOString()})`;
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === "function") {
    return value.name === "" ? "a function" : value.name;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value === "object" && value !== null) {
    return Object.prototype.toString.call(value);
  }
  return String(value);
}
