import { deepEqual } from "./equality.ts";

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

/** The checks on one value. Each throws when the check fails. */
export interface Matchers {
  /** Same value, compared with `Object.is`. */
  toBe(expected: unknown): void;
  /** Deeply equal, ignoring properties that are `undefined`. */
  toEqual(expected: unknown): void;
  /** A number at or above `expected`. */
  toBeGreaterThanOrEqual(expected: number | bigint): void;
  /** Exactly `null`. */
  toBeNull(): void;
  /** Exactly `undefined`. */
  toBeUndefined(): void;
}

/** The value under test, with its matchers and the negated ones under `not`. */
export type Assertion = Matchers & { readonly not: Matchers };

/** The shim's `expect`: a function plus the state calls Vitest's `expect` has. */
export interface ShimExpect {
  /** `message`, when given, starts the failure text, as in Vitest. */
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

type MatcherImplementation = (actual: unknown, expected: unknown) => MatcherCheck;

const matchers: Record<keyof Matchers, MatcherImplementation> = {
  toBe: (actual, expected) => ({
    pass: Object.is(actual, expected),
    expectation: `to be ${describeValue(expected)}`,
  }),
  toEqual: (actual, expected) => ({
    pass: deepEqual(actual, expected),
    expectation: `to equal ${describeValue(expected)}`,
  }),
  toBeGreaterThanOrEqual: (actual, expected) => ({
    pass: requireComparable(actual, "actual") >= requireComparable(expected, "expected"),
    expectation: `to be greater than or equal to ${describeValue(expected)}`,
  }),
  toBeNull: (actual) => ({ pass: actual === null, expectation: "to be null" }),
  toBeUndefined: (actual) => ({ pass: actual === undefined, expectation: "to be undefined" }),
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
    return {
      ...bindMatchers(actual, false, message),
      not: bindMatchers(actual, true, message),
    };
  };
  expect.getState = (): ExpectState => ({ ...state });
  expect.setState = (update: Partial<ExpectState>): void => {
    Object.assign(state, update);
  };
  return expect;
}

function bindMatchers(actual: unknown, negated: boolean, message: string | undefined): Matchers {
  const bound: Partial<Record<keyof Matchers, (expected?: unknown) => void>> = {};
  for (const name of Object.keys(matchers) as (keyof Matchers)[]) {
    bound[name] = (expected?: unknown) => {
      const check = matchers[name](actual, expected);
      if (check.pass === negated) {
        const not = negated ? "not " : "";
        const prefix = message === undefined ? "" : `${message}: `;
        throw new AssertionError(
          `${prefix}expected ${describeValue(actual)} ${not}${check.expectation}`,
        );
      }
    };
  }
  return bound as Matchers;
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

function describeValue(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : `Date(${value.toISOString()})`;
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
