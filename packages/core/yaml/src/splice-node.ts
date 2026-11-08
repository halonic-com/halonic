import {
  type CST,
  type Document,
  isCollection,
  isMap,
  isScalar,
  isSeq,
  type Node,
  type Pair,
  parseDocument,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";
import {
  aboveComments,
  alignComments,
  columnOf,
  entryEnd,
  insertLines,
  keepLineComment,
  keepsComments,
  lineStart,
  removeLines,
  renderAfterDash,
  renderAfterKey,
  renderDocument,
  renderItem,
  renderPair,
  renderScalar,
  replaceRange,
  startsItsLine,
} from "./edit-text.ts";
import type { YamlPath } from "./read.ts";

// The primitive splices. Each takes the text, parses it, changes only the
// characters of what it touches and returns the new text, or `undefined`
// when the layout is one it doesn't handle (the caller then falls back).

/** A parsed text with the source tokens that give the offsets of `-` markers. */
export interface Parsed {
  readonly text: string;
  readonly document: Document;
}

export function parse(text: string): Parsed {
  return { text, document: parseDocument(text, { keepSourceTokens: true }) };
}

/**
 * The node at `path`: `null` for an empty document, `undefined` when nothing
 * is there. Keys are matched as text, the way `readYaml` reads them.
 */
export function nodeAt(parsed: Parsed, path: YamlPath): Node | null | undefined {
  let node: unknown = parsed.document.contents;
  if (path.length === 0) {
    return (node as Node | null) ?? null;
  }
  for (const key of path) {
    node = childNode(node, key);
    if (node === undefined) {
      return undefined;
    }
  }
  return node as Node;
}

/**
 * True when a list or map in `path` (the node itself excluded) is written in
 * flow style, like `[a, b]`. An empty `{}` or `[]` doesn't count: adding to
 * it rewrites it in block style.
 */
export function insideFlow(parsed: Parsed, path: YamlPath): boolean {
  for (let length = 0; length < path.length; length++) {
    const node = nodeAt(parsed, path.slice(0, length));
    if (isCollection(node) && node.flow === true && node.items.length > 0) {
      return true;
    }
  }
  return false;
}

/** Replaces the value at `path` (which exists, or is the document) with freshly rendered text. */
export function replaceValue(parsed: Parsed, path: YamlPath, value: unknown): string | undefined {
  const { text } = parsed;
  if (path.length === 0) {
    const contents = parsed.document.contents;
    if (contents?.range == null) {
      return insertLines(text, text.length, renderDocument(value));
    }
    return replaceRange(text, contents.range[0], contents.range[1], renderDocument(value));
  }
  const parent = nodeAt(parsed, path.slice(0, -1));
  const key = path[path.length - 1] as string | number;
  if (isMap(parent)) {
    const pair = pairOf(parent, key);
    const keyNode = pair?.key as Node | undefined;
    if (keyNode?.range == null) {
      return undefined;
    }
    const valueEnd = (pair?.value as Node | null)?.range?.[1] ?? keyNode.range[1];
    const column = columnOf(text, keyNode.range[0]);
    const kept = keepLineComment(text, keyNode.range[1], valueEnd, renderAfterKey(value, column));
    return replaceRange(text, keyNode.range[1], kept.to, kept.rendered);
  }
  if (isSeq(parent) && typeof key === "number") {
    const dash = dashOffset(parent, key);
    const itemEnd = (parent.items[key] as Node | null)?.range?.[1];
    if (dash === undefined || itemEnd === undefined) {
      return undefined;
    }
    const kept = keepLineComment(text, dash, itemEnd, renderAfterDash(value, columnOf(text, dash)));
    return replaceRange(text, dash, kept.to, kept.rendered);
  }
  return undefined;
}

/** Replaces a one-line scalar's characters only, so a trailing comment and the quote style stay. */
export function replaceScalar(parsed: Parsed, node: Node, value: unknown): string | undefined {
  if (!isScalar(node) || node.range == null) {
    return undefined;
  }
  const [start, end] = node.range;
  const multiLine = parsed.text.slice(start, end).includes("\n");
  // An empty value (`key:`) has no characters to replace; block texts render whole.
  if (start === end || multiLine) {
    return undefined;
  }
  const rendered = renderScalar(value, node.type, columnOf(parsed.text, start));
  if (rendered === undefined) {
    return undefined;
  }
  return parsed.text.slice(0, start) + rendered + parsed.text.slice(end);
}

/** Adds `key: value` after the last entry of the block map at `mapPath`. */
export function addPair(
  parsed: Parsed,
  mapPath: YamlPath,
  key: string,
  value: unknown,
): string | undefined {
  const map = nodeAt(parsed, mapPath);
  if (!isMap(map)) {
    return undefined;
  }
  if (map.flow === true) {
    return map.items.length === 0 ? replaceValue(parsed, mapPath, { [key]: value }) : undefined;
  }
  const first = map.items[0]?.key as Node | undefined;
  const last = map.items[map.items.length - 1];
  if (first?.range == null || last === undefined) {
    return undefined;
  }
  const at = entryEnd(parsed.text, pairEnd(last));
  return insertLines(
    parsed.text,
    at,
    renderPair(key, value, columnOf(parsed.text, first.range[0])),
  );
}

/** Inserts `- value` into the block list at `listPath`, above the comments over item `index`. */
export function insertItem(
  parsed: Parsed,
  listPath: YamlPath,
  index: number,
  value: unknown,
): string | undefined {
  const { text } = parsed;
  const list = nodeAt(parsed, listPath);
  if (!isSeq(list)) {
    return undefined;
  }
  if (list.flow === true) {
    return list.items.length === 0 ? replaceValue(parsed, listPath, [value]) : undefined;
  }
  const atEnd = index === list.items.length;
  const dash = dashOffset(list, atEnd ? index - 1 : index);
  if (dash === undefined) {
    return undefined;
  }
  const column = columnOf(text, dash);
  if (atEnd) {
    const lastEnd = (list.items[index - 1] as Node | null)?.range?.[1];
    const lines = renderItem(value, column);
    return lastEnd === undefined ? undefined : insertLines(text, entryEnd(text, lastEnd), lines);
  }
  if (!startsItsLine(text, dash)) {
    // The first item of a list on a `- ` line (`- - a`): the new item takes
    // that place and the old one moves to the next line.
    const item = `${renderAfterDash(value, column)}${" ".repeat(column)}`;
    return text.slice(0, dash) + item + text.slice(dash);
  }
  return insertLines(text, aboveComments(text, lineStart(text, dash)), renderItem(value, column));
}

/** Removes the lines of the entry at `path`. The last entry leaves `{}` or `[]` behind. */
export function deleteEntry(parsed: Parsed, path: YamlPath): string | undefined {
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(parsed, parentPath);
  const key = path[path.length - 1] as string | number;
  if (!isCollection(parent) || parent.flow === true) {
    return undefined;
  }
  if (parent.items.length === 1) {
    return emptyCollection(parsed, parentPath, parent, key);
  }
  if (isMap(parent)) {
    return deletePair(parsed, parent, key);
  }
  if (isSeq(parent) && typeof key === "number") {
    return deleteItem(parsed, parent, key);
  }
  return undefined;
}

/**
 * Writes `{}` or `[]` in place of a collection whose only entry goes. The
 * comment lines right above that entry stay, under the `{}` or `[]`; when any
 * other comment would go with it, this gives up.
 */
function emptyCollection(
  parsed: Parsed,
  path: YamlPath,
  collection: YAMLMap | YAMLSeq,
  key: string | number,
): string | undefined {
  const { text } = parsed;
  const entry = isMap(collection) ? pairOf(collection, key) : undefined;
  const start = isMap(collection)
    ? (entry?.key as Node | undefined)?.range?.[0]
    : dashOffset(collection, 0);
  const valueEnd =
    entry !== undefined ? pairEnd(entry) : (collection.items[0] as Node | null)?.range?.[1];
  const end = collection.range?.[1];
  const emptied = replaceValue(parsed, path, isMap(collection) ? {} : []);
  if (start === undefined || valueEnd === undefined || end === undefined || emptied === undefined) {
    return undefined;
  }
  const from = startsItsLine(text, start) ? lineStart(text, start) : start;
  // At the top the comments above the first entry aren't replaced, so they stay anyway.
  const above =
    path.length > 0 && from !== start ? text.slice(aboveComments(text, from), from) : "";
  const at = emptied.length - (text.length - end);
  if (at < emptied.length && emptied[at - 1] !== "\n") {
    return undefined;
  }
  const result = above === "" ? emptied : insertLines(emptied, at, above);
  return keepsComments(text, from, entryEnd(text, valueEnd), result) ? result : undefined;
}

function deletePair(parsed: Parsed, map: YAMLMap, key: string | number): string | undefined {
  const { text } = parsed;
  const pair = pairOf(map, key);
  const start = (pair?.key as Node | undefined)?.range?.[0];
  if (pair === undefined || start === undefined) {
    return undefined;
  }
  const end = entryEnd(text, pairEnd(pair));
  if (startsItsLine(text, start)) {
    return removeLines(
      alignComments(text, end, columnOf(text, start)),
      lineStart(text, start),
      end,
    );
  }
  // The first key of a map on a `- ` line: the next key moves up to its place.
  const next = (map.items[1]?.key as Node | undefined)?.range?.[0];
  if (map.items[0] !== pair || next === undefined || text.slice(end, next).includes("#")) {
    return undefined;
  }
  return text.slice(0, start) + text.slice(next);
}

function deleteItem(parsed: Parsed, list: YAMLSeq, index: number): string | undefined {
  const { text } = parsed;
  const dash = dashOffset(list, index);
  const end = (list.items[index] as Node | null)?.range?.[1];
  if (dash === undefined || end === undefined) {
    return undefined;
  }
  const lineEnd = entryEnd(text, end);
  if (startsItsLine(text, dash)) {
    return removeLines(
      alignComments(text, lineEnd, columnOf(text, dash)),
      lineStart(text, dash),
      lineEnd,
    );
  }
  // The first item of a list on a `- ` line: the next item moves up to its place.
  const next = dashOffset(list, 1);
  if (index !== 0 || next === undefined || text.slice(lineEnd, next).includes("#")) {
    return undefined;
  }
  return text.slice(0, dash) + text.slice(next);
}

function childNode(node: unknown, key: string | number): unknown {
  if (isMap(node)) {
    return pairOf(node, key)?.value ?? undefined;
  }
  if (isSeq(node) && typeof key === "number") {
    return node.items[key];
  }
  return undefined;
}

/** The pair whose key reads as `key`; `readYaml` turns every key into text. */
function pairOf(map: YAMLMap, key: string | number): Pair | undefined {
  return map.items.find((pair) => isScalar(pair.key) && String(pair.key.value) === String(key));
}

function pairEnd(pair: Pair): number {
  const value = pair.value as Node | null;
  const key = pair.key as Node;
  return value?.range?.[1] ?? key.range?.[1] ?? 0;
}

/** The offset of the `-` that starts item `index` of a block list. */
function dashOffset(list: YAMLSeq, index: number): number | undefined {
  const token = list.srcToken;
  if (token?.type !== "block-seq") {
    return undefined;
  }
  // Only items with a `-` marker; trailing comments can form items without one.
  const dashes = (token as CST.BlockSequence).items.flatMap((item) =>
    item.start.filter((start) => start.type === "seq-item-ind").map((start) => start.offset),
  );
  return dashes.length === list.items.length ? dashes[index] : undefined;
}
