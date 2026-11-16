import type { FileIssue } from "./files-host.ts";

/** The problems that changes in a file caused in other files. */
export interface Elsewhere {
  readonly count: number;
  /** The file of the first one, in the order the host listed them. */
  readonly firstFile: string | undefined;
}

function keyOf(issue: FileIssue): string {
  return `${issue.file}\u0000${issue.severity}\u0000${issue.line}:${issue.col}\u0000${issue.message}`;
}

/** The problems in files other than `path`, counted by what they say and where, to compare two checks. */
export function problemsElsewhere(
  path: string,
  all: readonly FileIssue[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const issue of all) {
    if (issue.file === path) continue;
    counts.set(keyOf(issue), (counts.get(keyOf(issue)) ?? 0) + 1);
  }
  return counts;
}

/**
 * The problems in other files now that the check before the user's changes (`before`) did not
 * have: what the changes in `path` caused. A problem that went away is not subtracted, and one
 * that was there already is not counted.
 */
export function causedElsewhere(
  path: string,
  before: ReadonlyMap<string, number>,
  now: readonly FileIssue[],
): Elsewhere {
  const left = new Map(before);
  let count = 0;
  let firstFile: string | undefined;
  for (const issue of now) {
    if (issue.file === path) continue;
    const key = keyOf(issue);
    const same = left.get(key) ?? 0;
    if (same > 0) {
      left.set(key, same - 1);
      continue;
    }
    count += 1;
    firstFile ??= issue.file;
  }
  return { count, firstFile };
}

/** Errors before warnings, then in the order of the text: how the Problems list is sorted. */
export function sortedForList(issues: readonly FileIssue[]): readonly FileIssue[] {
  return [...issues].sort(
    (a, b) =>
      Number(a.severity === "warning") - Number(b.severity === "warning") ||
      a.line - b.line ||
      a.col - b.col,
  );
}
