import { describeObject, isPlainObject, keyPath } from "./plain-data.ts";

/**
 * Writes plain data as JSON in one canonical form, so equal data always
 * gives the same text and can be hashed: object keys sorted by code unit,
 * arrays kept in order, no spaces. As with `JSON.stringify`, an object key
 * whose value is `undefined` is left out.
 *
 * It throws instead of writing something lossy: a number that isn't finite,
 * `undefined` in an array, or a value JSON can't hold, such as a `Map`, a
 * `Date`, a function or a bigint.
 *
 * @param value - plain data: objects, arrays, strings, finite numbers, booleans and `null`
 * @returns the canonical JSON text
 * @throws when the data isn't plain JSON data, saying where
 *
 * @example
 * canonicalJson({ b: [2, 1], a: "x" }); // '{"a":"x","b":[2,1]}'
 */
export function canonicalJson(value: unknown): string {
  return write(value, "value");
}

function write(value: unknown, path: string): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Can't write ${path} as JSON: ${value} isn't a finite number.`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item, index) => {
      if (item === undefined) {
        throw new TypeError(`Can't write ${path}[${index}] as JSON: it is undefined.`);
      }
      return write(item, `${path}[${index}]`);
    });
    return `[${items.join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort(byCodeUnit);
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${write(value[key], keyPath(path, key))}`,
    );
    return `{${entries.join(",")}}`;
  }
  const kind = typeof value === "object" ? describeObject(value) : `a ${typeof value}`;
  throw new TypeError(`Can't write ${path} as JSON: it is ${kind}.`);
}

function byCodeUnit(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
