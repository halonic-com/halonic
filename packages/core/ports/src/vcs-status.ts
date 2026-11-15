import type { VcsChange, VcsFileStatus, VcsStatus } from "./vcs.ts";

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
 * Reads the output of `git status --porcelain=v2 -z`, with or without `--branch`: the branch
 * header lines, if any, then one record per changed path. A path changed both in the index and
 * in the working tree gives two changes, one staged and one not. The result is for a repository;
 * a folder that isn't one is for the caller to tell.
 */
export function parseStatus(output: string): VcsStatus {
  const status: VcsStatus = {
    isRepo: true,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    changes: [],
  };
  const fields = output.split("\0");
  for (let at = 0; at < fields.length; at++) {
    const field = fields[at] ?? "";
    if (field.startsWith("# ")) readHeader(field.slice(2), status);
    else if (field.startsWith("1 ")) status.changes.push(...ordinary(field, pathAfterSpaces["1"]));
    else if (field.startsWith("2 ")) {
      // A rename's old path is the next field.
      at += 1;
      status.changes.push(...ordinary(field, pathAfterSpaces["2"], fields[at]));
    } else if (field.startsWith("u ")) {
      status.changes.push({
        path: pathAfter(field, pathAfterSpaces.u),
        status: "conflicted",
        staged: false,
      });
    } else if (field.startsWith("? ")) {
      status.changes.push({ path: field.slice(2), status: "untracked", staged: false });
    }
  }
  return status;
}

function readHeader(header: string, status: VcsStatus): void {
  const space = header.indexOf(" ");
  const name = header.slice(0, space);
  const value = header.slice(space + 1);
  if (name === "branch.head") status.branch = value === "(detached)" ? null : value;
  if (name === "branch.upstream") status.upstream = value;
  if (name === "branch.ab") {
    const match = /^\+(\d+) -(\d+)$/u.exec(value);
    status.ahead = Number(match?.[1] ?? 0);
    status.behind = Number(match?.[2] ?? 0);
  }
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
    const change: VcsChange = { path, status, staged };
    if (status === "renamed" && from !== undefined) change.from = from;
    changes.push(change);
  }
  return changes;
}

/** The text after the first `spaces` spaces of a record: the path, which may hold spaces itself. */
function pathAfter(field: string, spaces: number): string {
  let at = 0;
  for (let found = 0; found < spaces; found++) at = field.indexOf(" ", at) + 1;
  return field.slice(at);
}
