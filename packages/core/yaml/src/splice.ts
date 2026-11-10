import { deepEqual } from "@halonicjs/std";
import { isMap, isScalar, isSeq, type Node } from "yaml";
import { applyEditToData, type YamlEdit } from "./edit-data.ts";
import { lineEndingOf } from "./edit-text.ts";
import type { YamlPath } from "./read.ts";
import {
  addPair,
  deleteEntry,
  flowAncestor,
  insertItem,
  isFilledFlow,
  nodeAt,
  type Parsed,
  parse,
  replaceFlow,
  replaceScalar,
  replaceValue,
} from "./splice-node.ts";

/**
 * Applies one edit by changing only the text of what it touches, so comments,
 * key order, quoting and blank lines elsewhere stay byte for byte. Expects an
 * edit that `applyEditToData` accepted on this text's data.
 *
 * New lines get the text's line ending and indent style. An edit inside a
 * flow collection like `[a, b]` writes that collection again on its line.
 *
 * @returns the new text, or `undefined` for a layout it doesn't handle yet
 *   (a flow collection over several lines, or a text that mixes line endings)
 */
export function spliceEdit(text: string, edit: YamlEdit): string | undefined {
  switch (lineEndingOf(text)) {
    case "\n":
      return spliceLines(text, edit);
    case "\r\n":
      // Every line break is `\r\n`, so this round trip is exact.
      return spliceLines(text.replaceAll("\r\n", "\n"), edit)?.replaceAll("\n", "\r\n");
    default:
      // New lines would have to pick one of the endings.
      return undefined;
  }
}

/** `spliceEdit` for a text whose line breaks are all `\n`. */
function spliceLines(text: string, edit: YamlEdit): string | undefined {
  const parsed = parse(text);
  const flow = flowAncestor(parsed, edit.path);
  if (flow !== undefined) {
    return spliceInFlow(parsed, edit, flow);
  }
  switch (edit.kind) {
    case "set":
      return spliceSet(parsed, edit.path, edit.value, edit.after);
    case "delete":
      return nodeAt(parsed, edit.path) === undefined ? text : deleteEntry(parsed, edit.path);
    case "insert":
      return insertItem(
        parsed,
        edit.path.slice(0, -1),
        edit.path[edit.path.length - 1] as number,
        edit.value,
      );
  }
}

/**
 * An edit inside the flow collection at `edit.path.slice(0, length)`. A set
 * of one scalar changes only its characters, when that reads back right;
 * anything else writes the whole collection again.
 */
function spliceInFlow(parsed: Parsed, edit: YamlEdit, length: number): string | undefined {
  const flowPath = edit.path.slice(0, length);
  const flow = nodeAt(parsed, flowPath);
  if (!isFilledFlow(flow)) {
    return undefined;
  }
  const value = applyEditToData(flow.toJS(parsed.document), {
    ...edit,
    path: edit.path.slice(length),
  });
  if (!value.ok) {
    return undefined;
  }
  const target = nodeAt(parsed, edit.path);
  if (edit.kind === "set" && isScalar(target) && !isCollectionValue(edit.value)) {
    // In flow style `,` and brackets end a plain text, so check the result.
    const spliced = replaceScalar(parsed, target, edit.value);
    const after = spliced === undefined ? undefined : nodeAt(parse(spliced), flowPath);
    if (after != null && deepEqual(after.toJS(parsed.document), value.value)) {
      return spliced;
    }
  }
  return replaceFlow(parsed, flow, value.value);
}

/** Sets an existing value, or adds the first missing key with the maps under it. */
function spliceSet(
  parsed: Parsed,
  path: YamlPath,
  value: unknown,
  after: string | null | undefined,
): string | undefined {
  for (let length = 0; length <= path.length; length++) {
    const prefix = path.slice(0, length);
    const node = nodeAt(parsed, prefix);
    const nested = nest(path.slice(length), value);
    if (node === undefined) {
      // `after` names a sibling of the last key, so it only counts when that key is the new one.
      const place = length === path.length ? after : undefined;
      return addPair(parsed, prefix.slice(0, -1), String(path[length - 1]), nested, place);
    }
    if (length === path.length || isEmpty(node)) {
      return setNode(parsed, prefix, node, nested);
    }
  }
  return undefined;
}

function setNode(
  parsed: Parsed,
  path: YamlPath,
  node: Node | null,
  value: unknown,
): string | undefined {
  const current = node === null ? null : node.toJS(parsed.document);
  if (deepEqual(current, value)) {
    return parsed.text;
  }
  if (isMap(node) && node.flow !== true && isFilledRecord(value) && node.items.length > 0) {
    return applyAll(parsed.text, mapChanges(path, current as Record<string, unknown>, value));
  }
  if (isSeq(node) && node.flow !== true && isFilledList(value) && node.items.length > 0) {
    return applyAll(parsed.text, listChanges(path, current as unknown[], value));
  }
  if (isFilledFlow(node) && isCollectionValue(value)) {
    return replaceFlow(parsed, node, value);
  }
  if (isScalar(node) && !isCollectionValue(value)) {
    const spliced = replaceScalar(parsed, node, value);
    if (spliced !== undefined) {
      return spliced;
    }
  }
  return replaceValue(parsed, path, value);
}

/**
 * A whole-map set as key edits: changed keys are set (and diffed further),
 * new keys are added at the end, and keys the new map lacks are deleted.
 */
function mapChanges(
  path: YamlPath,
  current: Record<string, unknown>,
  value: Record<string, unknown>,
): YamlEdit[] {
  const sets: YamlEdit[] = Object.entries(value)
    .filter(([key, child]) => !(Object.hasOwn(current, key) && deepEqual(current[key], child)))
    .map(([key, child]) => ({ kind: "set", path: [...path, key], value: child }));
  const deletes: YamlEdit[] = Object.keys(current)
    .filter((key) => !Object.hasOwn(value, key))
    .map((key) => ({ kind: "delete", path: [...path, key] }));
  // Sets first, so a map never empties out on the way and turns into `{}`.
  return [...sets, ...deletes];
}

/**
 * A whole-list set as item edits, compared index by index: the shared
 * indexes are set, then new items are added at the end or extra ones
 * deleted from the end.
 */
function listChanges(path: YamlPath, current: unknown[], value: unknown[]): YamlEdit[] {
  const changes: YamlEdit[] = [];
  const shared = Math.min(current.length, value.length);
  for (let index = 0; index < shared; index++) {
    if (!deepEqual(current[index], value[index])) {
      changes.push({ kind: "set", path: [...path, index], value: value[index] });
    }
  }
  for (let index = shared; index < value.length; index++) {
    changes.push({ kind: "insert", path: [...path, index], value: value[index] });
  }
  for (let index = current.length - 1; index >= value.length; index--) {
    changes.push({ kind: "delete", path: [...path, index] });
  }
  return changes;
}

function applyAll(text: string, edits: readonly YamlEdit[]): string | undefined {
  let current: string | undefined = text;
  for (const edit of edits) {
    current = spliceLines(current, edit);
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

/** `value` under the keys of `path`, as maps: `["a", "b"], 1` gives `{ a: { b: 1 } }`. */
function nest(path: YamlPath, value: unknown): unknown {
  return path.reduceRight<unknown>((inner, key) => Object.fromEntries([[key, inner]]), value);
}

/** An empty document or a `key:` with no value: `set` builds the maps below it. */
function isEmpty(node: Node | null): boolean {
  return node === null || (isScalar(node) && node.value === null);
}

function isCollectionValue(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function isFilledRecord(value: unknown): value is Record<string, unknown> {
  return (
    isCollectionValue(value) && !Array.isArray(value) && Object.keys(value as object).length > 0
  );
}

function isFilledList(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}
