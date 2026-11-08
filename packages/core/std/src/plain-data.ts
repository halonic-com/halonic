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

/**
 * Says in words what kind of object a value is, for an error message about
 * data that isn't plain: "a Map", "an Int8Array", "an instance of an unnamed
 * class", or "an object with a custom prototype" when no class made it, as
 * with `Object.create({})`.
 *
 * @param value - the object to describe
 * @returns the kind, with "a" or "an" in front
 *
 * @example
 * describeObject(new Map()); // "a Map"
 */
export function describeObject(value: object): string {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === null || prototype === Object.prototype) {
    return "a plain object";
  }
  // The prototype's own constructor, read without running a getter: an
  // inherited one would name Object for an object made by Object.create({}).
  const maker: unknown = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof maker !== "function") {
    return "an object with a custom prototype";
  }
  const name = maker.name;
  if (name === "") {
    return "an instance of an unnamed class";
  }
  // No "u": built-in names that start with it, such as Uint8Array and URL, take "a".
  return `${/^[aeio]/i.test(name) ? "an" : "a"} ${name}`;
}

/**
 * Adds an object key to a path such as `value.steps[0]`, for an error message
 * that says where a value is. A key that is a simple identifier follows a dot;
 * any other key is quoted in brackets, so the key `"a.b"` reads differently
 * from `a` then `b`, and the key `"0"` from an array index.
 *
 * @param path - the path so far
 * @param key - the key to add
 * @returns the longer path
 *
 * @example
 * keyPath("value.steps", "a.b"); // 'value.steps["a.b"]'
 */
export function keyPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
