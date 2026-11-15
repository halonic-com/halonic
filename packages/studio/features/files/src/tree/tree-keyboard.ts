import type { TreeRow } from "./visible-rows.ts";

/** What a key asks the rest of the Studio to do; the tree itself only moves and opens. */
export type TreeIntent =
  | { readonly kind: "open"; readonly path: string }
  | { readonly kind: "rename"; readonly path: string }
  | { readonly kind: "trash"; readonly path: string };

/** The letters typed in a row, so a quick "sk" finds "skills". */
export interface TypeAhead {
  readonly text: string;
  /** When the last letter was typed, in milliseconds. */
  readonly at: number;
}

/** Where the tree is: the focused row, the opened folders and the type-ahead letters. */
export interface TreeState {
  readonly focus: string | undefined;
  readonly expanded: ReadonlySet<string>;
  readonly typeAhead: TypeAhead;
}

/** What a key did: the new state, and an intent for the Studio when the key asks for one. */
export interface TreeKeyResult {
  readonly state: TreeState;
  readonly intent?: TreeIntent;
  /** Whether the tree used the key, so the page keeps it from scrolling or typing. */
  readonly handled: boolean;
}

/** After this long without a letter, the next one starts a new search. */
export const typeAheadPauseMs = 800;

/** A tree with nothing focused and nothing opened. */
export const emptyTreeState: TreeState = {
  focus: undefined,
  expanded: new Set(),
  typeAhead: { text: "", at: 0 },
};

type Handler = (rows: readonly TreeRow[], index: number, state: TreeState) => TreeKeyResult;

function moved(state: TreeState, focus: string | undefined): TreeKeyResult {
  return { state: { ...state, focus, typeAhead: emptyTreeState.typeAhead }, handled: true };
}

function withExpanded(state: TreeState, expanded: ReadonlySet<string>): TreeKeyResult {
  return { state: { ...state, expanded, typeAhead: emptyTreeState.typeAhead }, handled: true };
}

function toggled(state: TreeState, path: string, open: boolean): TreeKeyResult {
  const expanded = new Set(state.expanded);
  if (open) expanded.add(path);
  else expanded.delete(path);
  return withExpanded(state, expanded);
}

function rowAt(rows: readonly TreeRow[], index: number): TreeRow | undefined {
  return rows[Math.min(Math.max(index, 0), rows.length - 1)];
}

function arrowRight(rows: readonly TreeRow[], index: number, state: TreeState): TreeKeyResult {
  const row = rows[index];
  if (row?.node.kind !== "folder") return moved(state, state.focus);
  if (!state.expanded.has(row.node.path)) return toggled(state, row.node.path, true);
  const next = rows[index + 1];
  return moved(state, next?.parent === row.node.path ? next.node.path : state.focus);
}

function arrowLeft(rows: readonly TreeRow[], index: number, state: TreeState): TreeKeyResult {
  const row = rows[index];
  if (row?.node.kind === "folder" && state.expanded.has(row.node.path)) {
    return toggled(state, row.node.path, false);
  }
  return moved(state, row?.parent ?? state.focus);
}

/** `*` opens every folder next to the focused row (the ARIA tree pattern). */
function openSiblings(rows: readonly TreeRow[], index: number, state: TreeState): TreeKeyResult {
  const row = rows[index];
  const expanded = new Set(state.expanded);
  for (const other of rows) {
    if (other.parent === row?.parent && other.node.kind === "folder") expanded.add(other.node.path);
  }
  return withExpanded(state, expanded);
}

function enter(rows: readonly TreeRow[], index: number, state: TreeState): TreeKeyResult {
  const node = rows[index]?.node;
  if (node === undefined) return moved(state, state.focus);
  if (node.kind === "folder") return toggled(state, node.path, !state.expanded.has(node.path));
  return { state, intent: { kind: "open", path: node.path }, handled: true };
}

function fileIntent(kind: "rename" | "trash"): Handler {
  return (rows, index, state) => {
    const node = rows[index]?.node;
    if (node?.kind !== "file") return { state, handled: false };
    return { state, intent: { kind, path: node.path }, handled: true };
  };
}

const handlers: Readonly<Record<string, Handler>> = {
  ArrowDown: (rows, index, state) => moved(state, rowAt(rows, index + 1)?.node.path),
  ArrowUp: (rows, index, state) => moved(state, rowAt(rows, index - 1)?.node.path),
  Home: (rows, _index, state) => moved(state, rows[0]?.node.path),
  End: (rows, _index, state) => moved(state, rows.at(-1)?.node.path),
  ArrowRight: arrowRight,
  ArrowLeft: arrowLeft,
  "*": openSiblings,
  Enter: enter,
  F2: fileIntent("rename"),
  Delete: fileIntent("trash"),
};

function isLetter(key: string): boolean {
  return [...key].length === 1 && key.trim() !== "";
}

/** Finds the next row from the focused one, wrapping round, whose name starts with `text`. */
function searchFrom(rows: readonly TreeRow[], start: number, text: string): TreeRow | undefined {
  const wanted = text.toLowerCase();
  for (let step = 0; step < rows.length; step += 1) {
    const row = rows[(start + step) % rows.length];
    if (row?.node.name.toLowerCase().startsWith(wanted)) return row;
  }
  return undefined;
}

function typeAhead(
  rows: readonly TreeRow[],
  index: number,
  state: TreeState,
  key: string,
  now: number,
): TreeKeyResult {
  const fresh = now - state.typeAhead.at > typeAheadPauseMs;
  const text = fresh ? key : state.typeAhead.text + key;
  const same = [...text].every((letter) => letter.toLowerCase() === key.toLowerCase());
  // One letter typed again and again walks through the rows that start with it.
  const found = same
    ? searchFrom(rows, index + 1, key)
    : searchFrom(rows, Math.max(index, 0), text);
  const next: TreeState = { ...state, typeAhead: { text, at: now } };
  if (found === undefined) return { state: next, handled: true };
  return { state: { ...next, focus: found.node.path }, handled: true };
}

/**
 * What one key does in the tree (requirement `files.tree.keyboard`): ↑ ↓ move, → opens a folder or
 * steps into it, ← closes it or steps out, Home and End jump, `*` opens the folders next to the
 * focused row, letters find a row by name, Enter opens a file, F2 asks to rename it and Delete to
 * move it to the trash. The tree stays a pure model so the screen only draws it.
 *
 * @param rows - the shown rows from `visibleRows`
 * @param state - where the tree is now
 * @param key - the key's `KeyboardEvent.key`
 * @param now - the time of the key press in milliseconds, for type-ahead
 */
export function pressKey(
  rows: readonly TreeRow[],
  state: TreeState,
  key: string,
  now: number,
): TreeKeyResult {
  if (rows.length === 0) return { state, handled: false };
  const handler = Object.hasOwn(handlers, key) ? handlers[key] : undefined;
  if (handler === undefined && !isLetter(key)) return { state, handled: false };
  const index = rows.findIndex((row) => row.node.path === state.focus);
  // Nothing focused yet: the first key that means something lands on the first row.
  if (index < 0) return moved(state, rows[0]?.node.path);
  if (handler !== undefined) return handler(rows, index, state);
  return typeAhead(rows, index, state, key, now);
}
