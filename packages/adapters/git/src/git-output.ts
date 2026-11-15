import { parseStatus as parseStatusText, type VcsCommit, type VcsStatus } from "@halonicjs/ports";

/** The arguments {@link parseStatus} reads the output of. */
export const statusArgs: readonly string[] = [
  "status",
  "--porcelain=v2",
  "--branch",
  "--untracked-files=all",
  "--renames",
  "-z",
];

/** Reads {@link statusArgs}' output, as the shared parser does for any `git status` output. */
export function parseStatus(output: Buffer): VcsStatus {
  return parseStatusText(output.toString("utf8"));
}

/** The status of a folder that isn't a repository. */
export const noRepositoryStatus: VcsStatus = {
  isRepo: false,
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: [],
};

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
