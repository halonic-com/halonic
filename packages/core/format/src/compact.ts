import { describeObject, isPlainObject, keyPath } from "@halonicjs/std";

/**
 * Removes the values a saved file doesn't need, so files stay small: in every
 * object, a key whose value is `undefined`, an empty array or an empty object
 * is left out. Each value is compacted before it is checked, so
 * `{ a: { b: [] } }` loses `a` too.
 *
 * It behaves like the old app's `compact` (requirement `format.compact`):
 * - `null`, `""`, `0` and `false` are kept.
 * - Array items are compacted but never removed, not even `undefined` or `{}`,
 *   because removing one would shift the position of every item after it.
 * - The value passed in is never removed: `compact({})` is `{}`.
 * - A key named `__proto__` (`JSON.parse` can make one) is kept as an ordinary
 *   key; it never changes the result's prototype.
 *
 * Unlike the old app, it refuses any object that is neither a plain object nor
 * an array, such as a `Date`, a `Map` or a class instance. The old app turned
 * those into `{}` and left them out, quietly losing them; a parsed file never
 * contains one, so meeting one means the caller passed the wrong value.
 *
 * The input is not changed; the result is a new value that shares no objects
 * or arrays with it.
 *
 * @param value - the value about to be written, usually a parsed file
 * @returns the value without empty keys
 * @throws TypeError for an object that isn't a plain object or an array, naming where it is
 *
 * @example
 * compact({ name: "triage", tags: [], layout: {} }); // { name: "triage" }
 */
export function compact(value: unknown): unknown {
  return compactValue(value, "value");
}

function compactValue(value: unknown, path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => compactValue(item, `${path}[${index}]`));
  }
  if (isPlainObject(value)) {
    return compactObject(value, path);
  }
  if (typeof value === "object" && value !== null) {
    throw new TypeError(`compact writes plain data only, but ${path} is ${describeObject(value)}.`);
  }
  return value;
}

function compactObject(value: Record<string, unknown>, path: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const compacted = compactValue(child, keyPath(path, key));
    if (isEmpty(compacted)) {
      continue;
    }
    // defineProperty, not assignment: a "__proto__" key from JSON.parse
    // stays a plain key instead of changing the result's prototype.
    Object.defineProperty(result, key, {
      value: compacted,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return isPlainObject(value) && Object.keys(value).length === 0;
}
