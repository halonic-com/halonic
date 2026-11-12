import { deepEqual } from "./equality.ts";

/**
 * Whether `actual` contains everything `expected` describes, as Vitest's
 * `toMatchObject` sees it: a plain object matches when it has every property
 * of `expected`, each matching in turn, and may have more; an array matches
 * when it has the same length and each element matches. Everything else
 * (primitives, dates, patterns, maps, sets, errors) must be deeply equal.
 * A property `expected` sets to `undefined` must exist on `actual`.
 *
 * @param actual - the value under test
 * @param expected - the part it should contain
 * @returns whether `actual` contains `expected`
 */
export function containsMatch(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((element, index) => containsMatch(actual[index], element))
    );
  }
  if (!isPlainRecord(expected)) {
    return deepEqual(actual, expected);
  }
  if (typeof actual !== "object" || actual === null) {
    return false;
  }
  return ownKeys(expected).every(
    (key) => key in actual && containsMatch(readKey(actual, key), expected[key]),
  );
}

/** A plain object or class instance, as opposed to a date, pattern, map, set, error or typed array. */
function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const kind = Object.prototype.toString.call(value);
  return kind === "[object Object]" && !(value instanceof Error);
}

function ownKeys(value: object): PropertyKey[] {
  const symbols = Object.getOwnPropertySymbols(value).filter(
    (symbol) => Object.getOwnPropertyDescriptor(value, symbol)?.enumerable === true,
  );
  return [...Object.keys(value), ...symbols];
}

function readKey(value: object, key: PropertyKey): unknown {
  return (value as Record<PropertyKey, unknown>)[key];
}
