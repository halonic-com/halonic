import { isPlainObject } from "./plain-data.ts";

/**
 * Compares two values by content: arrays item by item, plain objects key by
 * key in any order, and dates by time. Numbers compare with `===`, except
 * that `NaN` equals `NaN`. Any other object (a `Map`, a class instance)
 * equals only itself.
 *
 * Unlike comparing `JSON.stringify` output, key order doesn't matter, and a
 * key whose value is `undefined` is still a key: `{ a: undefined }` doesn't
 * equal `{}`.
 *
 * Cyclic data isn't supported: comparing it throws a `RangeError`. JSON can't
 * express cycles, and `@halonicjs/yaml` rejects aliases that refer to
 * themselves. `deepClone` keeps cycles because it mirrors `structuredClone`,
 * while comparing a cycle would need extra bookkeeping on every call.
 *
 * @param first - the first value
 * @param second - the second value
 * @returns true when both have the same content
 *
 * @example
 * deepEqual({ a: [1, 2], b: "x" }, { b: "x", a: [1, 2] }); // true
 */
export function deepEqual(first: unknown, second: unknown): boolean {
  if (first === second) {
    return true;
  }
  if (typeof first === "number" && typeof second === "number") {
    return Number.isNaN(first) && Number.isNaN(second);
  }
  if (Array.isArray(first) && Array.isArray(second)) {
    return arraysEqual(first, second);
  }
  if (first instanceof Date && second instanceof Date) {
    return Object.is(first.getTime(), second.getTime());
  }
  if (isPlainObject(first) && isPlainObject(second)) {
    return objectsEqual(first, second);
  }
  return false;
}

function arraysEqual(first: readonly unknown[], second: readonly unknown[]): boolean {
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index++) {
    if (!deepEqual(first[index], second[index])) {
      return false;
    }
  }
  return true;
}

function objectsEqual(first: Record<string, unknown>, second: Record<string, unknown>): boolean {
  const firstKeys = Object.keys(first);
  if (firstKeys.length !== Object.keys(second).length) {
    return false;
  }
  for (const key of firstKeys) {
    if (!Object.hasOwn(second, key) || !deepEqual(first[key], second[key])) {
      return false;
    }
  }
  return true;
}
