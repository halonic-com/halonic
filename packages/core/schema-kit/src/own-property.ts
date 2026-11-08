/**
 * Sets `key` as an ordinary own property. Plain assignment would treat a key
 * named `__proto__` (which JSON and YAML input can contain) as a request to
 * change the object's prototype.
 */
export function setOwnProperty(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** Whether `value` is a map of keys to values: an object that isn't null or a list. */
export function isPlainMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `target` has `key` as its own property (not one from its prototype). */
export function hasOwnKey(target: object, key: string): boolean {
  return Object.hasOwn(target, key);
}
