import { deepClone, err, ok, type Result } from "@halonicjs/std";
import type { YamlPath } from "./read.ts";

/**
 * One change to a YAML text, at a path of keys and list indexes:
 * - `set`: puts `value` at `path`, creating missing maps on the way. On a
 *   list, the index must point at an item that exists. `path` `[]` replaces
 *   the whole document.
 * - `delete`: removes the key or list item at `path`. Nothing happens when
 *   nothing is there.
 * - `insert`: adds `value` to a list before the item at the index that ends
 *   `path`; the list's length adds it at the end.
 *
 * A `set` that adds a new key to a map puts it at the end of that map, or
 * right after the key `after` names; `after: null` puts it first. This is
 * where the key goes in the text, and in the data, so a block put back from
 * another version of the file lands where it was in every layout and in a
 * flow map. `after` does nothing when the key is already there, and a key
 * `after` names that isn't there means the end.
 */
export type YamlEdit =
  | {
      readonly kind: "set";
      readonly path: YamlPath;
      readonly value: unknown;
      readonly after?: string | null;
    }
  | { readonly kind: "delete"; readonly path: YamlPath }
  | { readonly kind: "insert"; readonly path: YamlPath; readonly value: unknown };

/**
 * Applies an edit to plain data, the way `editYaml` must change what the
 * text reads as. The read-back after each edit compares against this.
 *
 * @returns the new data (the input is not changed), or why the edit doesn't fit
 */
export function applyEditToData(data: unknown, edit: YamlEdit): Result<unknown, string> {
  const pathProblem = checkPath(edit.path);
  if (pathProblem !== undefined) {
    return err(pathProblem);
  }
  switch (edit.kind) {
    case "set":
      return setData(data, edit.path, edit.value, edit.after);
    case "delete":
      return deleteData(data, edit.path);
    case "insert":
      return insertData(data, edit.path, edit.value);
  }
}

/**
 * Says why a value has no YAML form that reads back equal, or `undefined`
 * when it has one: plain objects, arrays, text, numbers, booleans and `null`,
 * nested no deeper than `maxDepth`.
 */
export function checkValue(value: unknown, maxDepth: number): string | undefined {
  return checkValueAt(value, [], new Set(), maxDepth);
}

/** A path as people read it: `steps.0.id`, or "the top of the file" for `[]`. */
export function describePath(path: YamlPath): string {
  return path.length === 0 ? "the top of the file" : `"${path.join(".")}"`;
}

type Container = Record<string, unknown> | unknown[];

function setData(
  data: unknown,
  path: YamlPath,
  value: unknown,
  after: string | null | undefined,
): Result<unknown, string> {
  if (path.length === 0) {
    return ok(deepClone(value));
  }
  const root = isMissing(data) ? missingParent(path, 0) : ok(deepClone(data) as unknown);
  if (!root.ok) {
    return root;
  }
  let parent = root.value;
  for (let depth = 0; depth < path.length - 1; depth++) {
    const step = childForSet(parent, path, depth);
    if (!step.ok) {
      return step;
    }
    parent = step.value;
  }
  const placed = placeValue(parent, path, deepClone(value), after);
  return placed === undefined ? ok(root.value) : err(placed);
}

/** The child at `path[depth]`, created as an empty map when it is missing. */
function childForSet(parent: unknown, path: YamlPath, depth: number): Result<unknown, string> {
  const container = asContainer(parent, path, depth);
  if (!container.ok) {
    return container;
  }
  const child = readChild(container.value, path, depth);
  if (!child.ok) {
    return child;
  }
  if (!isMissing(child.value)) {
    return child;
  }
  const created = missingParent(path, depth + 1);
  if (created.ok) {
    setKey(container.value as Record<string, unknown>, path[depth] as string, created.value);
  }
  return created;
}

/** A new empty map for a missing parent; `set` never creates lists. */
function missingParent(path: YamlPath, depth: number): Result<unknown, string> {
  if (typeof path[depth] === "number") {
    return err(
      `There is no list at ${describePath(path.slice(0, depth))}; set creates only maps. Set the list first.`,
    );
  }
  return ok({});
}

function placeValue(
  parent: unknown,
  path: YamlPath,
  value: unknown,
  after: string | null | undefined,
): string | undefined {
  const container = asContainer(parent, path, path.length - 1);
  if (!container.ok) {
    return container.error;
  }
  const key = path[path.length - 1] as string | number;
  if (Array.isArray(container.value)) {
    const index = key as number;
    if (index === container.value.length) {
      return `${describePath(path)} is one past the end of the list; use insert to add an item.`;
    }
    if (index > container.value.length) {
      return noItem(path, path.length - 1, container.value.length);
    }
    container.value[index] = value;
    return undefined;
  }
  if (after !== undefined && !Object.hasOwn(container.value, key)) {
    addKeyAfter(container.value, key as string, value, after);
    return undefined;
  }
  setKey(container.value, key as string, value);
  return undefined;
}

/**
 * Adds a key the map doesn't have right after the key `after` names, or first
 * for `null`, or at the end when `after` isn't there. A plain object keeps
 * its keys in the order they were added, so every key is added again in the
 * new order. (A key that reads as a whole number, such as "2", still comes
 * first: JavaScript orders those itself.)
 */
function addKeyAfter(
  record: Record<string, unknown>,
  key: string,
  value: unknown,
  after: string | null,
): void {
  const entries = Object.entries(record);
  const previous = after === null ? -1 : entries.findIndex(([name]) => name === after);
  const at = after !== null && previous === -1 ? entries.length : previous + 1;
  entries.splice(at, 0, [key, value]);
  for (const [name] of entries) {
    delete record[name];
  }
  for (const [name, entryValue] of entries) {
    setKey(record, name, entryValue);
  }
}

function deleteData(data: unknown, path: YamlPath): Result<unknown, string> {
  if (path.length === 0) {
    return err("delete needs a path; to empty the file, set [] to {}.");
  }
  const copy = deepClone(data);
  let parent: unknown = copy;
  for (let depth = 0; depth < path.length - 1; depth++) {
    if (isMissing(parent)) {
      return ok(copy);
    }
    const container = asContainer(parent, path, depth);
    if (!container.ok) {
      return container;
    }
    const child = readChild(container.value, path, depth);
    // An item past the end of a list is nothing to delete.
    parent = child.ok ? child.value : undefined;
  }
  if (isMissing(parent)) {
    return ok(copy);
  }
  const container = asContainer(parent, path, path.length - 1);
  if (!container.ok) {
    return container;
  }
  const key = path[path.length - 1] as string | number;
  if (Array.isArray(container.value)) {
    container.value.splice(key as number, 1);
  } else if (Object.hasOwn(container.value, key)) {
    delete container.value[key as string];
  }
  return ok(copy);
}

function insertData(data: unknown, path: YamlPath, value: unknown): Result<unknown, string> {
  const index = path[path.length - 1];
  if (typeof index !== "number") {
    return err("insert needs a path that ends in a list index.");
  }
  const copy = deepClone(data);
  let list: unknown = copy;
  for (let depth = 0; depth < path.length - 1; depth++) {
    const container = asContainer(list, path, depth);
    if (!container.ok) {
      return container;
    }
    const child = readChild(container.value, path, depth);
    if (!child.ok) {
      return child;
    }
    list = child.value;
  }
  if (!Array.isArray(list)) {
    return err(`There is no list at ${describePath(path.slice(0, -1))} to insert into.`);
  }
  if (index > list.length) {
    return err(noItem(path, path.length - 1, list.length));
  }
  list.splice(index, 0, deepClone(value));
  return ok(copy);
}

/** The value at `path[depth]` inside a container; an index past the end is a problem. */
function readChild(container: Container, path: YamlPath, depth: number): Result<unknown, string> {
  const key = path[depth] as string | number;
  if (Array.isArray(container)) {
    const index = key as number;
    return index < container.length
      ? ok(container[index])
      : err(noItem(path, depth, container.length));
  }
  return ok(Object.hasOwn(container, key) ? container[key as string] : undefined);
}

/** Checks that `value` (at `path[0..depth)`) can hold the key `path[depth]`. */
function asContainer(value: unknown, path: YamlPath, depth: number): Result<Container, string> {
  const at = describePath(path.slice(0, depth));
  const key = path[depth];
  if (Array.isArray(value)) {
    return typeof key === "number"
      ? ok(value)
      : err(`${at} is a list; use a number, not "${String(key)}", to reach an item.`);
  }
  if (typeof value === "object" && value !== null) {
    return typeof key === "string"
      ? ok(value as Record<string, unknown>)
      : err(`${at} is a map; use a text key, not ${String(key)}.`);
  }
  return err(`${at} holds ${describeKind(value)}, not a map or a list.`);
}

function noItem(path: YamlPath, depth: number, length: number): string {
  return `There is no item ${String(path[depth])} in ${describePath(path.slice(0, depth))}; the list has ${length}.`;
}

function checkPath(path: YamlPath): string | undefined {
  for (const key of path) {
    if (typeof key === "number" && !(Number.isInteger(key) && key >= 0)) {
      return `A list index must be a whole number of 0 or more, not ${key}.`;
    }
    if (typeof key !== "number" && typeof key !== "string") {
      return `A path holds only text keys and list indexes, not ${typeof key}.`;
    }
  }
  return undefined;
}

/**
 * Sets an own key, also one named `__proto__`, which plain assignment would
 * turn into a prototype change. YAML files can hold such a key.
 */
function setKey(record: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(record, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** `null` and absent values: `set` creates a map in their place. */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null;
}

function checkValueAt(
  value: unknown,
  path: (string | number)[],
  open: Set<object>,
  maxDepth: number,
): string | undefined {
  const at = path.length === 0 ? "The value" : `The value at ${describePath(path)}`;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return undefined;
  }
  if (typeof value !== "object") {
    return `${at} is ${describeKind(value)}, which YAML can't hold.`;
  }
  if (open.has(value)) {
    return `${at} contains itself, which YAML can't hold.`;
  }
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    return `${at} is ${describeKind(value)}; YAML holds only plain objects and arrays.`;
  }
  if (path.length >= maxDepth) {
    return `${at} nests deeper than the limit of ${maxDepth} levels.`;
  }
  open.add(value);
  const entries: [string | number, unknown][] = Array.isArray(value)
    ? Array.from(value.keys(), (index) => [index, index in value ? value[index] : undefined])
    : Object.entries(value);
  for (const [key, child] of entries) {
    const problem = checkValueAt(child, [...path, key], open, maxDepth);
    if (problem !== undefined) {
      return problem;
    }
  }
  open.delete(value);
  return undefined;
}

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function describeKind(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "object") {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    return name === undefined ? "an object" : `a ${name}`;
  }
  if (typeof value === "string") return "text";
  return `a ${typeof value}`;
}
