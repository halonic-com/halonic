/**
 * True for objects made by `{}`, `Object.create(null)` or `JSON.parse`: the
 * plain records that deep equality and deep clone walk into.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
