/**
 * Deep equality as Vitest's `toEqual` sees it, for the data the contract
 * suites compare: primitives, arrays, plain objects, `Date`, `RegExp`,
 * errors, `Map`, `Set` and typed arrays such as `Uint8Array`.
 *
 * The rules follow Vitest's `equals`: object properties whose value is
 * `undefined` don't count, classes of plain objects aren't compared, and
 * `NaN` equals `NaN` but `0` doesn't equal `-0`. Unlike Vitest it doesn't
 * follow circular references; the suites don't build any. The parity test
 * checks each rule against Vitest.
 *
 * @param actual - the value under test
 * @param expected - the value it should equal
 * @returns whether the two are equal
 */
export function deepEqual(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }
  if (!isObject(actual) || !isObject(expected)) {
    return false;
  }
  const kind = kindOf(actual);
  if (kind !== kindOf(expected)) {
    return false;
  }
  switch (kind) {
    case "[object Date]":
      return sameTime(actual as Date, expected as Date);
    case "[object RegExp]":
      return sameRegExp(actual as RegExp, expected as RegExp);
    case "[object Map]":
      return sameMap(actual as Map<unknown, unknown>, expected as Map<unknown, unknown>);
    case "[object Set]":
      return sameSet(actual as Set<unknown>, expected as Set<unknown>);
  }
  if (isTypedArray(actual) && isTypedArray(expected)) {
    return sameTypedArray(actual, expected);
  }
  if (actual instanceof Error && expected instanceof Error) {
    return sameError(actual, expected);
  }
  if (Array.isArray(actual) && actual.length !== (expected as unknown[]).length) {
    return false;
  }
  return sameProperties(actual, expected);
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** The `[object X]` tag that tells an array from a `Date`, a `Map` or a plain object. */
function kindOf(value: object): string {
  return Object.prototype.toString.call(value);
}

/** Two dates at the same millisecond; two invalid dates count as equal. */
function sameTime(actual: Date, expected: Date): boolean {
  return Object.is(actual.getTime(), expected.getTime());
}

function sameRegExp(actual: RegExp, expected: RegExp): boolean {
  return actual.source === expected.source && actual.flags === expected.flags;
}

/** Same size, and every key of `actual` maps to an equal value in `expected`. */
function sameMap(actual: Map<unknown, unknown>, expected: Map<unknown, unknown>): boolean {
  if (actual.size !== expected.size) {
    return false;
  }
  return [...actual].every(([key, value]) =>
    expected.has(key)
      ? deepEqual(value, expected.get(key))
      : [...expected].some(
          ([otherKey, other]) => deepEqual(key, otherKey) && deepEqual(value, other),
        ),
  );
}

/** Same size, and every member of `actual` has an equal member in `expected`. */
function sameSet(actual: Set<unknown>, expected: Set<unknown>): boolean {
  if (actual.size !== expected.size) {
    return false;
  }
  return [...actual].every(
    (member) => expected.has(member) || [...expected].some((other) => deepEqual(member, other)),
  );
}

/** A `Uint8Array`, `Float64Array` and the like; a `DataView` has no elements to compare. */
function isTypedArray(value: object): value is Uint8Array {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/** Same class, same length and the same elements; a `Uint8Array` never equals a `Buffer`. */
function sameTypedArray(actual: Uint8Array, expected: Uint8Array): boolean {
  return (
    actual.constructor === expected.constructor &&
    actual.length === expected.length &&
    actual.every((element, index) => Object.is(element, expected[index]))
  );
}

/** Same name and message, and equal own properties such as a `code`. */
function sameError(actual: Error, expected: Error): boolean {
  return (
    actual.name === expected.name &&
    actual.message === expected.message &&
    (expected.cause === undefined || deepEqual(actual.cause, expected.cause)) &&
    sameProperties({ ...actual }, { ...expected })
  );
}

/** The same defined own properties, each deeply equal. */
function sameProperties(actual: object, expected: object): boolean {
  const actualKeys = definedKeys(actual);
  const expectedKeys = definedKeys(expected);
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key) =>
        Object.hasOwn(expected, key) &&
        deepEqual(
          (actual as Record<PropertyKey, unknown>)[key],
          (expected as Record<PropertyKey, unknown>)[key],
        ),
    )
  );
}

/** Own enumerable keys, symbols included, whose value isn't `undefined`. */
function definedKeys(value: object): PropertyKey[] {
  const record = value as Record<PropertyKey, unknown>;
  const symbols = Object.getOwnPropertySymbols(value).filter(
    (symbol) => Object.getOwnPropertyDescriptor(value, symbol)?.enumerable === true,
  );
  return [...Object.keys(value), ...symbols].filter((key) => record[key] !== undefined);
}
