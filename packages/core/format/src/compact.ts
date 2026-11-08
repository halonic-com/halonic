/**
 * Removes the values a saved file doesn't need, so files stay small: in every
 * object, a key whose value is `undefined`, an empty array or an empty object
 * is left out. Each value is compacted before it is checked, so
 * `{ a: { b: [] } }` loses `a` too.
 *
 * It behaves exactly like the old app's `compact` (requirement `format.compact`):
 * - `null`, `""`, `0` and `false` are kept.
 * - Array items are compacted but never removed, not even `undefined` or `{}`,
 *   because removing one would shift the position of every item after it.
 * - The value passed in is never removed: `compact({})` is `{}`.
 * - Any other object, such as a `Date`, is read through its own enumerable
 *   keys and becomes a plain object.
 *
 * The input is not changed; the result is a new value that shares no objects
 * or arrays with it.
 *
 * @param value - the value about to be written, usually a parsed file
 * @returns the value without empty keys
 *
 * @example
 * compact({ name: "triage", tags: [], layout: {} }); // { name: "triage" }
 */
export function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compact);
  }
  if (isObject(value)) {
    return compactObject(value);
  }
  return value;
}

function compactObject(value: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const compacted = compact(child);
    if (isEmpty(compacted)) {
      continue;
    }
    result[key] = compacted;
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
  return isObject(value) && Object.keys(value).length === 0;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
