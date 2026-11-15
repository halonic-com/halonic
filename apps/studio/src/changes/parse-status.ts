import type { VcsChange, VcsFileStatus } from "@halonicjs/ports";

/** The arguments {@link parseStatus} reads the output of. */
export const statusArgs: readonly string[] = [
  "status",
  "--porcelain=v2",
  "--untracked-files=all",
  "-z",
];

/** What one letter of a porcelain `XY` field means; `.` is no change. */
const letterStatus: Readonly<Record<string, VcsFileStatus>> = {
  M: "modified",
  T: "modified",
  A: "added",
  C: "added",
  D: "deleted",
  R: "renamed",
};

/** The spaces before the path in an ordinary (`1`), renamed (`2`) and conflicted (`u`) record. */
const pathAfterSpaces = { "1": 8, "2": 9, u: 10 } as const;

/**
 * Reads the output of `git status --porcelain=v2 -z`: one record per changed path. A path
 * changed both in the index and in the working tree gives two changes, one staged and one not,
 * as the `Vcs` port's `status` does.
 */
export function parseStatus(output: string): VcsChange[] {
  const fields = output.split("\0");
  const changes: VcsChange[] = [];
  for (let at = 0; at < fields.length; at++) {
    const field = fields[at] ?? "";
    const kind = field.charAt(0);
    if (kind === "?") {
      changes.push({ path: field.slice(2), status: "untracked", staged: false });
    } else if (kind === "u") {
      changes.push({
        path: pathAfter(field, pathAfterSpaces.u),
        status: "conflicted",
        staged: false,
      });
    } else if (kind === "1") {
      changes.push(...ordinary(field, pathAfterSpaces["1"]));
    } else if (kind === "2") {
      // A rename's old path is the next field.
      at += 1;
      changes.push(...ordinary(field, pathAfterSpaces["2"], fields[at]));
    }
  }
  return changes;
}

/** The changes of an ordinary or renamed record: one for the index letter, one for the tree's. */
function ordinary(field: string, spaces: number, from?: string): VcsChange[] {
  const path = pathAfter(field, spaces);
  const changes: VcsChange[] = [];
  for (const [letter, staged] of [
    [field.charAt(2), true],
    [field.charAt(3), false],
  ] as const) {
    const status = letterStatus[letter];
    if (status === undefined) continue;
    changes.push({
      path,
      status,
      staged,
      ...(status === "renamed" && from !== undefined ? { from } : {}),
    });
  }
  return changes;
}

/** The text after the first `spaces` spaces of a record: the path, which may hold spaces itself. */
function pathAfter(field: string, spaces: number): string {
  let at = -1;
  for (let seen = 0; seen < spaces; seen++) at = field.indexOf(" ", at + 1);
  return field.slice(at + 1);
}
