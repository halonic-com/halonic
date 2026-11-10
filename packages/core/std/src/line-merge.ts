import { diffLines, type LineChange, splitLines } from "./line-diff.ts";

/**
 * One stretch of a three-way merge. `resolved` lines are settled: both sides
 * kept them, or only one side changed them. A `conflict` is where both sides
 * changed the same lines, or lines next to each other, differently. It holds
 * those lines as they were in the base and as each side has them.
 */
export type MergeRegion =
  | { readonly kind: "resolved"; readonly lines: readonly string[] }
  | {
      readonly kind: "conflict";
      readonly base: readonly string[];
      readonly ours: readonly string[];
      readonly theirs: readonly string[];
    };

/**
 * Merges two texts that each started from `base`, line by line, as git's
 * merge does. A change only one side made is taken. The same change on both
 * sides is taken once. Where both sides changed the same lines differently,
 * or changed lines that touch (one ends where the other starts, or both add
 * lines at the same place), the result has a conflict for the caller to
 * settle, with `mergedText` or by asking the person.
 *
 * @param base - the text both sides started from
 * @param ours - our side
 * @param theirs - their side
 * @returns the merged text as regions in order, with resolved lines next to each other joined
 *
 * @example
 * mergeLines("a\nb\nc\n", "A\nb\nc\n", "a\nb\nC\n");
 * // [{ kind: "resolved", lines: ["A\n", "b\n", "C\n"] }]
 */
export function mergeLines(base: string, ours: string, theirs: string): MergeRegion[] {
  const baseLines = splitLines(base);
  const groups = groupChanges(diffLines(base, ours), diffLines(base, theirs));

  const regions: MergeRegion[] = [];
  let next = 0;
  for (const group of groups) {
    addResolved(regions, baseLines.slice(next, group.start));
    const baseSlice = baseLines.slice(group.start, group.end);
    const oursSlice = applyWithin(baseSlice, group.start, group.ours);
    const theirsSlice = applyWithin(baseSlice, group.start, group.theirs);
    if (group.theirs.length === 0 || sameLines(oursSlice, theirsSlice)) {
      addResolved(regions, oursSlice);
    } else if (group.ours.length === 0) {
      addResolved(regions, theirsSlice);
    } else {
      regions.push({ kind: "conflict", base: baseSlice, ours: oursSlice, theirs: theirsSlice });
    }
    next = group.end;
  }
  addResolved(regions, baseLines.slice(next));
  return regions;
}

/**
 * The text of a merge, settling each conflict by taking one side whole.
 *
 * @param regions - what `mergeLines` gave back
 * @param onConflict - which side wins a conflict
 * @returns the merged text
 *
 * @example
 * // A person's edit inside a change the assistant made: the person's text wins.
 * mergedText(mergeLines(before, baseline, after), "theirs");
 */
export function mergedText(regions: readonly MergeRegion[], onConflict: "ours" | "theirs"): string {
  return regions
    .flatMap((region) => {
      if (region.kind === "resolved") return region.lines;
      return onConflict === "ours" ? region.ours : region.theirs;
    })
    .join("");
}

/**
 * Whether a merge has a conflict.
 *
 * @param regions - what `mergeLines` gave back
 */
export function hasConflicts(regions: readonly MergeRegion[]): boolean {
  return regions.some((region) => region.kind === "conflict");
}

/** Changes from both sides that overlap or touch, over the base lines `start` up to `end`. */
interface ChangeGroup {
  start: number;
  end: number;
  readonly ours: LineChange[];
  readonly theirs: LineChange[];
}

/**
 * Puts the changes of both sides in order and groups the ones that overlap
 * or touch, so each group is settled on its own. Changes from one side never
 * touch each other (`diffLines` leaves a kept line between them), so a group
 * only grows past one change when the other side bridges it.
 */
function groupChanges(ours: readonly LineChange[], theirs: readonly LineChange[]): ChangeGroup[] {
  const tagged = [
    ...ours.map((change) => ({ change, side: "ours" as const })),
    ...theirs.map((change) => ({ change, side: "theirs" as const })),
  ].sort((first, second) => first.change.beforeStart - second.change.beforeStart);

  const groups: ChangeGroup[] = [];
  let current: ChangeGroup | undefined;
  for (const { change, side } of tagged) {
    if (current === undefined || change.beforeStart > current.end) {
      current = { start: change.beforeStart, end: change.beforeEnd, ours: [], theirs: [] };
      groups.push(current);
    }
    current.end = Math.max(current.end, change.beforeEnd);
    current[side].push(change);
  }
  return groups;
}

/** One side's lines for a group: the base slice (starting at base line `start`) with that side's changes in it. */
function applyWithin(
  baseSlice: readonly string[],
  start: number,
  changes: readonly LineChange[],
): string[] {
  const out: string[] = [];
  let next = 0;
  for (const change of changes) {
    out.push(...baseSlice.slice(next, change.beforeStart - start), ...change.added);
    next = change.beforeEnd - start;
  }
  out.push(...baseSlice.slice(next));
  return out;
}

/** Adds settled lines, joined to the region before when that one is settled too. */
function addResolved(regions: MergeRegion[], lines: readonly string[]): void {
  if (lines.length === 0) return;
  const last = regions.at(-1);
  if (last?.kind === "resolved") {
    regions[regions.length - 1] = { kind: "resolved", lines: [...last.lines, ...lines] };
    return;
  }
  regions.push({ kind: "resolved", lines });
}

function sameLines(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((line, index) => line === second[index]);
}
