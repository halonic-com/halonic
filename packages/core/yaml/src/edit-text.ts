import { assert } from "@halonicjs/std";
import { Scalar, stringify } from "yaml";

// Line arithmetic and rendering for the splicer. Offsets are UTF-16 indexes
// into the whole text, as the yaml library's ranges are.

/** The line width `writeYamlFile` folds at; new text is folded to fit inside it. */
const fileLineWidth = 100;
/** Deeply indented text still gets this much room before it folds. */
const minimumLineWidth = 40;

const byteOrderMark = "﻿";

/** Where the line holding `offset` starts. A byte order mark isn't part of the first line. */
export function lineStart(text: string, offset: number): number {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  return start === 0 && text.startsWith(byteOrderMark) ? 1 : start;
}

/** The column of `offset`, counting from 0. */
export function columnOf(text: string, offset: number): number {
  return offset - lineStart(text, offset);
}

/** True when only spaces come before `offset` on its line. */
export function startsItsLine(text: string, offset: number): boolean {
  return text.slice(lineStart(text, offset), offset).trim() === "";
}

/**
 * Where the entry whose value ends at `valueEnd` ends: after its line break,
 * so a trailing `# comment` goes with it. Block collections already end after
 * a line break.
 */
export function entryEnd(text: string, valueEnd: number): number {
  if (valueEnd > 0 && text[valueEnd - 1] === "\n") {
    return valueEnd;
  }
  const lineBreak = text.indexOf("\n", valueEnd);
  return lineBreak === -1 ? text.length : lineBreak + 1;
}

/** Moves `offset` (a line start) up over the comment lines right above it. */
export function aboveComments(text: string, offset: number): number {
  let start = offset;
  while (start > 0) {
    const previous = lineStart(text, start - 1);
    if (!text.slice(previous, start).trim().startsWith("#")) {
      break;
    }
    start = previous;
  }
  return start;
}

/**
 * True when every comment line of `before`, outside `before[from, to)`, is
 * still a line of `after`.
 */
export function keepsComments(before: string, from: number, to: number, after: string): boolean {
  const left = new Map<string, number>();
  for (const line of commentLines(after)) {
    left.set(line, (left.get(line) ?? 0) + 1);
  }
  return commentLines(before.slice(0, from) + before.slice(to)).every((line) => {
    const count = left.get(line) ?? 0;
    left.set(line, count - 1);
    return count > 0;
  });
}

/**
 * Removes the lines from `from` to `to` (both line starts). When blank lines
 * sat on both sides, one of them goes too, so two sections stay one blank
 * line apart instead of two.
 */
export function removeLines(text: string, from: number, to: number): string {
  const lineBefore = from > 0 ? lineStart(text, from - 1) : from;
  const blankBefore = from > 0 && isBlank(text.slice(lineBefore, from));
  if (blankBefore && to === text.length) {
    // The last entry of the file: don't leave a blank line at the end.
    return text.slice(0, lineBefore);
  }
  const lineAfter = text.indexOf("\n", to);
  const lineAfterEnd = lineAfter === -1 ? text.length : lineAfter + 1;
  const blankAfter = to < text.length && isBlank(text.slice(to, lineAfterEnd));
  const end = blankBefore && blankAfter ? lineAfterEnd : to;
  return text.slice(0, from) + text.slice(end);
}

/** Inserts whole lines at a line start; at the end of a text without a final line break, adds one first. */
export function insertLines(text: string, at: number, lines: string): string {
  if (at === text.length && text.length > 0 && !text.endsWith("\n")) {
    return `${text}\n${lines.slice(0, -1)}`;
  }
  return text.slice(0, at) + lines + text.slice(at);
}

/**
 * Replaces `text[from, to)` with `rendered`, keeping a line break at the end
 * only when the replaced text had one.
 */
export function replaceRange(text: string, from: number, to: number, rendered: string): string {
  const body = rendered.endsWith("\n") ? rendered.slice(0, -1) : rendered;
  const ending = to > from && text[to - 1] === "\n" ? "\n" : "";
  return text.slice(0, from) + body + ending + text.slice(to);
}

/** `key: value` as whole lines, indented to `column`. Keys are quoted by the library, never pasted. */
export function renderPair(key: string, value: unknown, column: number): string {
  return indent(render({ [key]: value }, column), column, true);
}

/** `- value` as whole lines, indented to `column`. */
export function renderItem(value: unknown, column: number): string {
  return indent(render([value], column), column, true);
}

/**
 * The text that follows a key to give it `value`: `: 1`, or `:` and the
 * indented lines of a list or map. It starts right after the key.
 */
export function renderAfterKey(value: unknown, column: number): string {
  // Render under a one-letter key and drop that key; the rest is ours.
  const pair = render({ k: value }, column);
  assert(pair.startsWith("k:"), "Expected the yaml library to write a plain key k.");
  return indent(pair.slice(1), column, false);
}

/** `- value` starting at the dash, with following lines indented to `column`. */
export function renderAfterDash(value: unknown, column: number): string {
  return indent(render([value], column), column, false);
}

/** A whole document. */
export function renderDocument(value: unknown): string {
  return render(value, 0);
}

/**
 * A scalar on one line, keeping a quoted text quoted the same way. `undefined`
 * when it needs more than one line.
 */
export function renderScalar(value: unknown, quoteStyle: Scalar.Type | undefined, column: number) {
  const keepQuotes =
    typeof value === "string" &&
    (quoteStyle === Scalar.QUOTE_DOUBLE || quoteStyle === Scalar.QUOTE_SINGLE);
  const node = new Scalar(value);
  if (keepQuotes) {
    node.type = quoteStyle;
  }
  const text = render(node, column).replace(/\n$/, "");
  return text.includes("\n") ? undefined : text;
}

function render(value: unknown, column: number): string {
  const lineWidth = Math.max(fileLineWidth - column, minimumLineWidth);
  const text: string | undefined = stringify(value, { lineWidth });
  assert(text !== undefined, "Expected a value checked by checkValue.");
  return text;
}

/** Indents every non-empty line (or every line after the first) by `column` spaces. */
function indent(text: string, column: number, firstLineToo: boolean): string {
  const pad = " ".repeat(column);
  return text
    .split("\n")
    .map((line, index) => (line === "" || (index === 0 && !firstLineToo) ? line : pad + line))
    .join("\n");
}

/** The lines that hold only a comment, without their indent. */
function commentLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("#"));
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}
