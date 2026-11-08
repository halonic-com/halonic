/** A JSON object: not `null` and not an array. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether `value` nests objects and arrays more than `limit` deep, counting
 * `value` itself as 1. It stops looking at `limit`, so a deep or cyclic
 * value can't overflow the stack.
 */
export function nestsDeeperThan(value: unknown, limit: number): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (limit === 0) {
    return true;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    if (nestsDeeperThan(child, limit - 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Sets `key` as an own property of `target`. A listing may name a property
 * `__proto__`, which passes the name rule, and a plain assignment would set
 * the object's prototype instead.
 */
export function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
