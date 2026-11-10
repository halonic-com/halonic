import { diffLines } from "@halonicjs/std";
import type { ChangeLine } from "./revert-parts.ts";

/**
 * The one line for an item that is new or deleted as a whole, with no parts:
 * undoing it is undoing the file. No line when neither version exists.
 */
export function wholeItemLine(before: unknown, after: unknown): ChangeLine[] {
  if (before === undefined && after === undefined) {
    return [];
  }
  return [{ id: "item", sentence: before === undefined ? "New" : "Deleted", parts: [] }];
}

/** The keys of both versions: the labelled ones in their listed order, then any others. */
export function keysInOrder(
  labels: Readonly<Record<string, string>>,
  ...versions: object[]
): string[] {
  const keys = new Set(Object.keys(labels));
  for (const version of versions) {
    for (const key of Object.keys(version)) {
      keys.add(key);
    }
  }
  return [...keys];
}

/** The value of a field of a parsed item, which TypeScript can't index by any string. */
export function fieldOf(item: object, field: string): unknown {
  return (item as Record<string, unknown>)[field];
}

/**
 * What changed in a list of names, such as an agent's connections:
 * "added gmail, removed slack". Lists are reverted whole, so this is one line.
 *
 * @example
 * listChange(["slack", "notion"], ["notion", "gmail"]); // "added gmail, removed slack"
 * listChange(["a", "b"], ["b", "a"]); // "order changed"
 */
export function listChange(was: readonly string[], is: readonly string[]): string {
  const added = is.filter((name) => !was.includes(name));
  const removed = was.filter((name) => !is.includes(name));
  const words: string[] = [];
  if (added.length > 0) {
    words.push(`added ${added.join(", ")}`);
  }
  if (removed.length > 0) {
    words.push(`removed ${removed.join(", ")}`);
  }
  return words.length > 0 ? words.join(", ") : "order changed";
}

/**
 * How many sentences of a text changed, for "Instructions edited: 2
 * sentences changed". A sentence ends at ".", "!" or "?" followed by a space,
 * or at a line break. A sentence rewritten counts once, not as one removed
 * and one added.
 *
 * @example
 * sentencesChanged("Be brief. Use English.", "Be brief. Use Dutch."); // 1
 */
export function sentencesChanged(was: string, is: string): number {
  return diffLines(sentencesOf(was), sentencesOf(is)).reduce(
    (count, change) => count + Math.max(change.removed.length, change.added.length),
    0,
  );
}

/** Each sentence of a text on a line of its own, trimmed, without empty lines. */
function sentencesOf(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "")
    .map((sentence) => `${sentence}\n`)
    .join("");
}

/** "1 sentence changed", "2 sentences changed". */
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** An id as a name, for items and steps that have no name field: "page-oncall" → "Page oncall". */
export function nameFromId(id: string): string {
  const words = id.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
