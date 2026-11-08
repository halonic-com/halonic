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
  columnOf,
  entryEnd,
  insertLines,
  renderAfterDash,
  renderAfterKey,
  renderDocument,
  renderPair,
  renderScalar,
  replaceRange,
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
    return replaceRange(text, keyNode.range[1], valueEnd, renderAfterKey(value, column));
  }
  if (isSeq(parent) && typeof key === "number") {
    const dash = dashOffset(parent, key);
    const itemEnd = (parent.items[key] as Node | null)?.range?.[1];
    if (dash === undefined || itemEnd === undefined) {
      return undefined;
    }
    return replaceRange(text, dash, itemEnd, renderAfterDash(value, columnOf(text, dash)));
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
