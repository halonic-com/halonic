import type { VcsChange, VcsCommit, VcsFileStatus, VcsStatus } from "@halonicjs/ports";

/** The arguments {@link parseStatus} reads the output of. */
export const statusArgs: readonly string[] = [
  "status",
  "--porcelain=v2",
  "--branch",
  "--untracked-files=all",
  "--renames",
  "-z",
];

/** The status of a folder that isn't a repository. */
export const noRepositoryStatus: VcsStatus = {
  isRepo: false,
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [],
};

/** What one letter of a porcelain `XY` field means; `.` is no change. */
const letterStatus: Readonly<Record<string, VcsFileStatus>> = {
  M: "modified",
  T: "modified",
  A: "added",
  C: "added",
  D: "deleted",
  R: "renamed",
};

/**
 * Reads `git status --porcelain=v2 --branch -z`: the branch header lines,
 * then one record per changed path. A path changed both in the index and in
 * the working tree gives two changes, one staged and one not.
 */
export function parseStatus(output: Buffer): VcsStatus {
  const status: VcsStatus = { ...noRepositoryStatus, isRepo: true, changes: [] };
  const fields = output.toString("utf8").split("\0");
  for (let at = 0; at < fields.length; at++) {
    const field = fields[at] ?? "";
    if (field.startsWith("# ")) readHeader(field.slice(2), status);
    else if (field.startsWith("1 ")) status.changes.push(...ordinary(field, 8));
    else if (field.startsWith("2 ")) {
      // A rename's old path is the next field.
      at += 1;
      status.changes.push(...ordinary(field, 9, fields[at]));
    } else if (field.startsWith("u ")) {
      status.changes.push({ path: pathAfter(field, 10), status: "conflicted", staged: false });
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

/** The changes of an ordinary (`1`) or renamed (`2`) record, whose path starts after `spaces` spaces. */
function ordinary(field: string, spaces: number, from?: string): VcsChange[] {
  const [indexLetter, treeLetter] = [field.charAt(2), field.charAt(3)];
  const path = pathAfter(field, spaces);
  const changes: VcsChange[] = [];
  for (const [letter, staged] of [
    [indexLetter, true],
    [treeLetter, false],
  ] as const) {
    const status = letterStatus[letter];
    if (status === undefined) continue;
    const change: VcsChange = { path, status, staged };
    if (status === "renamed" && from !== undefined) change.from = from;
    changes.push(change);
  }
  return changes;
}

/** The rest of `field` after its first `spaces` spaces; a path may hold spaces itself. */
function pathAfter(field: string, spaces: number): string {
  let at = 0;
  for (let found = 0; found < spaces; found++) at = field.indexOf(" ", at) + 1;
  return field.slice(at);
}

/** The arguments {@link parseLog} reads the output of, for at most `limit` commits. */
export function logArgs(limit: number): string[] {
  return [
    "log",
    "-z",
    "--format=%H%x00%an%x00%aI%x00%B",
    `--max-count=${limit}`,
    "--no-show-signature",
  ];
}

/** Reads {@link logArgs}' output: four NUL-separated fields per commit. */
export function parseLog(output: Buffer): VcsCommit[] {
  const text = output.toString("utf8");
  if (text === "") return [];
  const fields = text.split("\0");
  const commits: VcsCommit[] = [];
  for (let at = 0; at + 3 < fields.length; at += 4) {
    commits.push({
      hash: fields[at] ?? "",
      author: fields[at + 1] ?? "",
      date: new Date(fields[at + 2] ?? "").toISOString(),
      message: (fields[at + 3] ?? "").split("\n")[0] ?? "",
    });
  }
  return commits;
}

/** The non-empty lines of `output`. */
export function outputLines(output: Buffer): string[] {
  return output
    .toString("utf8")
    .split("\n")
    .filter((line) => line !== "");
}
