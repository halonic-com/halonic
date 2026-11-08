import { isPlainObject } from "./plain-data.ts";

/**
 * Copies plain data all the way down: arrays, plain objects, dates and
 * primitives. A value that appears twice, or contains itself, is copied once
 * and shared the same way in the copy, as `structuredClone` does. The core
 * has no `structuredClone`, so this replaces it for run events, records and
 * workflow context.
 *
 * @param value - the data to copy
 * @returns a copy that shares no objects with `value`
 * @throws TypeError for anything that isn't plain data, such as a function, a `Map` or a class instance
 *
 * @example
 * const copy = deepClone({ steps: [{ id: "a" }] });
 */
export function deepClone<T>(value: T): T {
  return cloneValue(value, new Map(), "value") as T;
}

function cloneValue(value: unknown, copies: Map<object, unknown>, path: string): unknown {
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`deepClone can't copy the ${typeof value} at ${path}.`);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const existing = copies.get(value);
  if (existing !== undefined) {
    return existing;
  }
  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    copies.set(value, copy);
    return copy;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (let index = 0; index < value.length; index++) {
      copy.push(cloneValue(value[index], copies, `${path}[${index}]`));
    }
    return copy;
  }
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> =
      Object.getPrototypeOf(value) === null ? Object.create(null) : {};
    copies.set(value, copy);
    for (const key of Object.keys(value)) {
      // defineProperty, not assignment: a "__proto__" key from JSON.parse
      // stays a plain key instead of changing the copy's prototype.
      Object.defineProperty(copy, key, {
        value: cloneValue(value[key], copies, `${path}.${key}`),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return copy;
  }
  const kind = value.constructor?.name ?? "object";
  throw new TypeError(`deepClone copies plain data only, but ${path} is a ${kind}.`);
}
