/**
 * One run of changed lines between two texts: the lines `removed` from the
 * text before, at `beforeStart` up to `beforeEnd`, and the lines `added` in
 * their place. Line numbers count from 0. An insertion has
 * `beforeStart === beforeEnd`; a deletion has no `added` lines.
 *
 * Each line keeps its newline, so a last line without one differs from the
 * same line with one, as it does for git.
 */
export interface LineChange {
  /** The first line of the text before that this change replaces. */
  readonly beforeStart: number;
  /** The line after the last one it replaces; equals `beforeStart` for an insertion. */
  readonly beforeEnd: number;
  /** Where the `added` lines start in the text after. */
  readonly afterStart: number;
  readonly removed: readonly string[];
  readonly added: readonly string[];
}

/**
 * The lines of `text`, each with its newline (`\n`), so joining them gives
 * the text back. A last line without a newline is kept as it is; an empty
 * text has no lines.
 *
 * @example
 * splitLines("a\nb"); // ["a\n", "b"]
 */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
}

/**
 * The most lines `diffLines` compares pair by pair: the changed lines before
 * times the changed lines after. Its table takes 4 bytes a pair, so this is
 * about 16 MB. Above it, the changed middle is one change.
 */
export const MAX_COMPARED_LINE_PAIRS = 4_000_000;

/** Options for `diffLines`. */
export interface DiffLinesOptions {
  /** The most line pairs to compare; `MAX_COMPARED_LINE_PAIRS` when left out. */
  readonly maxComparedLinePairs?: number;
}

/**
 * The changes that turn `before` into `after`, line by line, in order and
 * never touching each other: two changes always have at least one unchanged
 * line between them.
 *
 * The diff keeps the longest run of common lines (a longest common
 * subsequence). It skips the lines both texts start and end with first, so
 * the usual edit of a few lines in a long file stays cheap. The changed
 * middles are then compared pair by pair, which takes time and memory in
 * proportion to their line counts multiplied. When that is more than
 * `MAX_COMPARED_LINE_PAIRS` (a rewrite of a generated file or a lockfile),
 * the whole middle is one change instead: still a correct diff, just a
 * coarse one, which shows a big rewrite as one part to take or drop.
 *
 * @param before - the text as it was
 * @param after - the text as it is now
 * @param options - the limit on pairs compared, for tests
 * @returns the changes, empty when the texts are the same
 *
 * @example
 * diffLines("a\nb\nc\n", "a\nB\nc\n");
 * // [{ beforeStart: 1, beforeEnd: 2, afterStart: 1, removed: ["b\n"], added: ["B\n"] }]
 */
export function diffLines(
  before: string,
  after: string,
  options: DiffLinesOptions = {},
): LineChange[] {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const prefix = commonPrefixLength(beforeLines, afterLines);
  const suffix = commonSuffixLength(beforeLines, afterLines, prefix);
  const middleBefore = beforeLines.slice(prefix, beforeLines.length - suffix);
  const middleAfter = afterLines.slice(prefix, afterLines.length - suffix);
  const maxPairs = options.maxComparedLinePairs ?? MAX_COMPARED_LINE_PAIRS;
  // No matches makes the whole middle one change.
  const middle =
    middleBefore.length * middleAfter.length > maxPairs
      ? []
      : matchLines(middleBefore, middleAfter);
  return collectChanges(middle, beforeLines, afterLines, prefix, suffix);
}

/**
 * Applies some of the changes `diffLines(before, …)` gave back to `before`.
 * The changes not passed are left out, so the text keeps its `before` lines
 * there. Passing all of them gives the text after; passing none gives
 * `before`.
 *
 * This is how one part of a diff is taken or dropped: to take only the
 * second change, apply `[changes[1]]`; to drop only the second, apply every
 * change but that one.
 *
 * @param before - the same text the changes were worked out from
 * @param changes - some of those changes, in any order
 * @returns the text with those changes applied
 * @throws Error when two changes overlap, or a change's `removed` lines aren't
 *   the lines of `before` at its place (it comes from another text, or the
 *   text changed since)
 */
export function applyLineChanges(before: string, changes: readonly LineChange[]): string {
  const beforeLines = splitLines(before);
  const ordered = [...changes].sort((first, second) => first.beforeStart - second.beforeStart);
  const out: string[] = [];
  let next = 0;
  for (const change of ordered) {
    if (change.beforeStart < next) {
      throw new Error(
        `applyLineChanges: the change at line ${change.beforeStart + 1} overlaps another.`,
      );
    }
    if (
      change.beforeEnd > beforeLines.length ||
      !sameLines(beforeLines.slice(change.beforeStart, change.beforeEnd), change.removed)
    ) {
      throw new Error(
        `applyLineChanges: the change at line ${change.beforeStart + 1} isn't from this text.`,
      );
    }
    out.push(...beforeLines.slice(next, change.beforeStart), ...change.added);
    next = change.beforeEnd;
  }
  out.push(...beforeLines.slice(next));
  return out.join("");
}

/** Whether two lists have the same lines in the same order. */
export function sameLines(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((line, index) => line === second[index]);
}

/** How many lines both lists start with. */
function commonPrefixLength(first: readonly string[], second: readonly string[]): number {
  let length = 0;
  while (length < first.length && length < second.length && first[length] === second[length]) {
    length++;
  }
  return length;
}

/** How many lines both lists end with, not counting the first `skip` lines of either. */
function commonSuffixLength(
  first: readonly string[],
  second: readonly string[],
  skip: number,
): number {
  let length = 0;
  while (
    length < first.length - skip &&
    length < second.length - skip &&
    first[first.length - 1 - length] === second[second.length - 1 - length]
  ) {
    length++;
  }
  return length;
}

/** A line both lists keep: its index in the first list and in the second. */
interface LineMatch {
  readonly before: number;
  readonly after: number;
}

/**
 * The lines both lists keep, in order, as a longest common subsequence.
 * `common(i, j)` is the length of the longest one for `first[i..]` and
 * `second[j..]`, read from a table filled from the end.
 */
function matchLines(first: readonly string[], second: readonly string[]): LineMatch[] {
  const width = second.length + 1;
  const table = new Uint32Array((first.length + 1) * width);
  // Every cell read is inside the table, which starts filled with 0.
  const common = (i: number, j: number) => table[i * width + j] as number;
  for (let i = first.length - 1; i >= 0; i--) {
    for (let j = second.length - 1; j >= 0; j--) {
      table[i * width + j] =
        first[i] === second[j]
          ? common(i + 1, j + 1) + 1
          : Math.max(common(i + 1, j), common(i, j + 1));
    }
  }

  const matches: LineMatch[] = [];
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    if (first[i] === second[j]) {
      matches.push({ before: i, after: j });
      i++;
      j++;
    } else if (common(i + 1, j) >= common(i, j + 1)) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

/**
 * Turns the lines the middle part keeps into changes over the whole texts.
 * Every gap between two kept lines, or before the first or after the last,
 * that isn't empty on both sides is one change. The middle starts at line
 * `prefix` in both texts and ends where their common last lines start.
 */
function collectChanges(
  middleMatches: readonly LineMatch[],
  beforeLines: readonly string[],
  afterLines: readonly string[],
  prefix: number,
  suffix: number,
): LineChange[] {
  const kept = middleMatches.map((match) => ({
    before: match.before + prefix,
    after: match.after + prefix,
  }));
  // The first common last line closes the final gap; it's past the end when there is none.
  kept.push({ before: beforeLines.length - suffix, after: afterLines.length - suffix });

  const changes: LineChange[] = [];
  let beforeAt = prefix;
  let afterAt = prefix;
  for (const match of kept) {
    if (match.before > beforeAt || match.after > afterAt) {
      changes.push({
        beforeStart: beforeAt,
        beforeEnd: match.before,
        afterStart: afterAt,
        removed: beforeLines.slice(beforeAt, match.before),
        added: afterLines.slice(afterAt, match.after),
      });
    }
    beforeAt = match.before + 1;
    afterAt = match.after + 1;
  }
  return changes;
}
