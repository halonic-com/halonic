import { assert } from "@halonicjs/std";
import { Scalar, stringify } from "yaml";

// Line arithmetic and rendering for the splicer. Offsets are UTF-16 indexes
// into the whole text, as the yaml library's ranges are.

/** The line width `writeYamlFile` folds at; new text is folded to fit inside it. */
const fileLineWidth = 100;
/** Deeply indented text still gets this much room before it folds. */
const minimumLineWidth = 40;

const byteOrderMark = "\uFEFF";

/**
 * How the file indents its blocks, so new lines match it: the spaces per
 * level, and whether a list under a key is indented (`indentSeq`) or starts
 * at the key's column. These are the yaml library's own options.
 */
export interface IndentStyle {
  readonly indent: number;
  readonly indentSeq: boolean;
}

/** The library's defaults, which `writeYamlFile` writes with. */
export const defaultIndentStyle: IndentStyle = { indent: 2, indentSeq: true };

/**
 * The text's line ending: `\r\n` when every line break is one, `\n` when every
 * one is that or there are none, `undefined` when the text mixes them.
 */
export function lineEndingOf(text: string): "\n" | "\r\n" | undefined {
  const breaks = new Set(text.match(/\r\n|\r|\n/g));
  if (breaks.size === 0 || (breaks.size === 1 && breaks.has("\n"))) {
    return "\n";
  }
  return breaks.size === 1 && breaks.has("\r\n") ? "\r\n" : undefined;
}

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
 * line apart instead of two. At the start or the end of the file, the blank
 * lines next to the removed ones go too, so none is left there.
 */
export function removeLines(text: string, from: number, to: number): string {
  if (isBlank(text.slice(to))) {
    // The last entry of the file: the blank lines above it go with it.
    return text.slice(0, blankLinesAbove(text, from)) + text.slice(to);
  }
  if (from === lineStart(text, 0)) {
    // The first entry of the file: the blank lines below it go with it.
    return text.slice(0, from) + text.slice(blankLinesBelow(text, to));
  }
  const lineBefore = lineStart(text, from - 1);
  const blankBefore = isBlank(text.slice(lineBefore, from));
  const lineAfterEnd = lineEnd(text, to);
  const blankAfter = isBlank(text.slice(to, lineAfterEnd));
  const end = blankBefore && blankAfter ? lineAfterEnd : to;
  return text.slice(0, from) + text.slice(end);
}

/**
 * Moves the comment lines from `at` (a line start) down to the next entry to
 * that entry's indent, when it starts at `column`. These are comments left
 * indented under a block that is deleted above them; less indented ones stay.
 */
export function alignComments(text: string, at: number, column: number): string {
  const comments: number[] = [];
  let start = at;
  while (start < text.length) {
    const line = text.slice(start, lineEnd(text, start));
    if (!isBlank(line) && !line.trim().startsWith("#")) {
      break;
    }
    if (!isBlank(line) && indentOf(line) > column) {
      comments.push(start);
    }
    start = lineEnd(text, start);
  }
  if (start === text.length || indentOf(text.slice(start, lineEnd(text, start))) !== column) {
    return text;
  }
  const pad = " ".repeat(column);
  // From the last, so the earlier offsets still hold.
  return comments.reduceRight((result, comment) => {
    const indent = indentOf(result.slice(comment, lineEnd(result, comment)));
    return result.slice(0, comment) + pad + result.slice(comment + indent);
  }, text);
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

/**
 * Moves a comment on the line where `text[from, to)` starts onto the first line of
 * `rendered`, when only blanks, the `:` or `-` and a block text header come before it:
 * `a: # about a` over a block value, or with no value. Comment lines inside the
 * old value go with it.
 *
 * @returns where the replaced text ends (past the comment) and what replaces it
 */
export function keepLineComment(
  text: string,
  from: number,
  to: number,
  rendered: string,
): { to: number; rendered: string } {
  const lineBreak = text.indexOf("\n", from);
  const lineEnd = lineBreak === -1 ? text.length : lineBreak;
  const comment = /^[ \t]*[:-]?(?:[ \t]+[|>][-+1-9]*)?[ \t]+(#.*)$/.exec(
    text.slice(from, lineEnd),
  )?.[1];
  if (comment === undefined) {
    return { to, rendered };
  }
  const firstBreak = rendered.indexOf("\n");
  const head = firstBreak === -1 ? rendered : rendered.slice(0, firstBreak);
  return {
    to: Math.max(to, lineEnd),
    rendered: `${head} ${comment}${rendered.slice(head.length)}`,
  };
}

/** `key: value` as whole lines, indented to `column`. Keys are quoted by the library, never pasted. */
export function renderPair(
  key: string,
  value: unknown,
  column: number,
  style: IndentStyle,
): string {
  return indent(render({ [key]: value }, column, style), column, true);
}

/** `- value` as whole lines, indented to `column`. */
export function renderItem(value: unknown, column: number, style: IndentStyle): string {
  return indent(render([value], column, style), column, true);
}

/**
 * The text that follows a key to give it `value`: `: 1`, or `:` and the
 * indented lines of a list or map. It starts right after the key.
 */
export function renderAfterKey(value: unknown, column: number, style: IndentStyle): string {
  // Render under a one-letter key and drop that key; the rest is ours.
  const pair = render({ k: value }, column, style);
  assert(pair.startsWith("k:"), "Expected the yaml library to write a plain key k.");
  return indent(pair.slice(1), column, false);
}

/** `- value` starting at the dash, with following lines indented to `column`. */
export function renderAfterDash(value: unknown, column: number, style: IndentStyle): string {
  return indent(render([value], column, style), column, false);
}

/** A whole document. */
export function renderDocument(value: unknown, style: IndentStyle): string {
  return render(value, 0, style);
}

/**
 * A list or map in flow style on one line, like `[a, b]`, with spaces inside
 * the brackets when `padding` is set. `undefined` when it needs more than one
 * line, as a text with a line break does.
 */
export function renderFlow(value: unknown, padding: boolean): string | undefined {
  // Line width 0: the library never breaks a flow collection over lines.
  const text: string | undefined = stringify(value, {
    collectionStyle: "flow",
    flowCollectionPadding: padding,
    lineWidth: 0,
  });
  assert(text !== undefined, "Expected a value checked by checkValue.");
  const line = text.replace(/\n$/, "");
  return line.includes("\n") ? undefined : line;
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
  const text = render(node, column, defaultIndentStyle).replace(/\n$/, "");
  return text.includes("\n") ? undefined : text;
}

function render(value: unknown, column: number, style: IndentStyle): string {
  const lineWidth = Math.max(fileLineWidth - column, minimumLineWidth);
  const text: string | undefined = stringify(value, { lineWidth, ...style });
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

/** Where the line holding `offset` ends: after its line break, or at the end of the text. */
function lineEnd(text: string, offset: number): number {
  const lineBreak = text.indexOf("\n", offset);
  return lineBreak === -1 ? text.length : lineBreak + 1;
}

/** How many spaces start `line`. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** Moves `offset` (a line start) up over the blank lines right above it. */
function blankLinesAbove(text: string, offset: number): number {
  let start = offset;
  while (start > lineStart(text, 0) && isBlank(text.slice(lineStart(text, start - 1), start))) {
    start = lineStart(text, start - 1);
  }
  return start;
}

/** Moves `offset` (a line start) down over the blank lines from it. */
function blankLinesBelow(text: string, offset: number): number {
  let end = offset;
  while (end < text.length && isBlank(text.slice(end, lineEnd(text, end)))) {
    end = lineEnd(text, end);
  }
  return end;
}
