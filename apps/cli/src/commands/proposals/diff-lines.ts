// The diff `halonic proposals show` prints for a file: a unified diff from
// the saved file to the run's text, as `git diff` writes one, so a person
// who reads diffs already knows it. Built on `diffLines` of
// `@halonicjs/std`, the diff the Studio's Compare uses too.

import { diffLines, type LineChange, splitLines } from "@halonicjs/std";

/** How many unchanged lines are shown around a change, as git does. */
const contextLines = 3;

/** What git prints after a text's last line when it has no newline, so a change to only that is seen. */
export const noNewlineMarker = "\\ No newline at end of file";

/**
 * The lines of a unified diff from `before` to `after`: a `@@` heading per
 * group of nearby changes, then each line with ` `, `-` or `+` in front,
 * without its newline, and {@link noNewlineMarker} after a text's last line
 * when it has none. `null` means no file: everything is added or removed.
 *
 * @returns no lines when the texts are the same
 *
 * @example
 * unifiedDiff("a\nb\n", "a\nc\n"); // ["@@ -1,2 +1,2 @@", " a", "-b", "+c"]
 */
export function unifiedDiff(before: string | null, after: string | null): string[] {
  const beforeText = before ?? "";
  const beforeLines = splitLines(beforeText);
  const changes = diffLines(beforeText, after ?? "");
  return hunksOf(changes).flatMap((hunk) => hunkLines(hunk, beforeLines));
}

/** The changes in groups whose context would touch or overlap, each shown under one heading. */
function hunksOf(changes: readonly LineChange[]): LineChange[][] {
  const hunks: LineChange[][] = [];
  for (const change of changes) {
    const current = hunks.at(-1);
    const previous = current?.at(-1);
    if (
      current !== undefined &&
      previous !== undefined &&
      change.beforeStart - previous.beforeEnd <= 2 * contextLines
    ) {
      current.push(change);
    } else {
      hunks.push([change]);
    }
  }
  return hunks;
}

/** One group's heading and lines, with the unchanged lines around and between its changes. */
function hunkLines(hunk: readonly LineChange[], beforeLines: readonly string[]): string[] {
  const [first] = hunk;
  const last = hunk.at(-1);
  if (first === undefined || last === undefined) return [];
  const start = Math.max(0, first.beforeStart - contextLines);
  const end = Math.min(beforeLines.length, last.beforeEnd + contextLines);
  const lines: string[] = [];
  let position = start;
  let removed = 0;
  let added = 0;
  for (const change of hunk) {
    lines.push(...unchanged(beforeLines, position, change.beforeStart));
    lines.push(...change.removed.flatMap((line) => shown("-", line)));
    lines.push(...change.added.flatMap((line) => shown("+", line)));
    removed += change.removed.length;
    added += change.added.length;
    position = change.beforeEnd;
  }
  lines.push(...unchanged(beforeLines, position, end));
  const beforeCount = end - start;
  const afterStart = first.afterStart - (first.beforeStart - start);
  const heading = `@@ -${rangeOf(start, beforeCount)} +${rangeOf(afterStart, beforeCount - removed + added)} @@`;
  return [heading, ...lines];
}

function unchanged(lines: readonly string[], from: number, to: number): string[] {
  return lines.slice(from, to).flatMap((line) => shown(" ", line));
}

/** A range as git writes it: the first line counting from 1, then the count; an empty range starts at the line before. */
function rangeOf(start: number, count: number): string {
  return `${count === 0 ? start : start + 1},${count}`;
}

/** A line with its sign in front and without its newline, then the marker when it had none. */
function shown(sign: " " | "-" | "+", line: string): string[] {
  return line.endsWith("\n")
    ? [`${sign}${line.slice(0, -1)}`]
    : [`${sign}${line}`, noNewlineMarker];
}
