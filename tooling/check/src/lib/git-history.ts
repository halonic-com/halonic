import { execFileSync } from "node:child_process";

/**
 * Reads commits and old file contents for the personal-terms guard
 * (plan 11.1). Plain git, no libraries, so the guard's job runs no
 * third-party code next to the secret.
 */

function git(root: string, args: readonly string[], input?: string): Buffer {
  return execFileSync("git", args, {
    cwd: root,
    input,
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** One commit: who wrote it and its message. */
export interface CommitEntry {
  readonly hash: string;
  readonly author: string;
  readonly committer: string;
  readonly message: string;
}

/**
 * The commits `git log` lists for these revisions. Entries are split on
 * NUL (`-z`), which can't appear in a commit message.
 */
export function readCommits(root: string, revisions: readonly string[]): CommitEntry[] {
  const log = git(root, [
    "log",
    "-z",
    "--format=%H%n%an <%ae>%n%cn <%ce>%n%B",
    ...revisions,
  ]).toString("utf8");
  return log
    .split("\0")
    .filter((entry) => entry.trim() !== "")
    .map((entry) => {
      const [hash = "", author = "", committer = "", ...message] = entry.split("\n");
      return { hash, author, committer, message: message.join("\n") };
    });
}

/** A file version from some commit: its blob, a path it had, and its bytes. */
export interface HistoryBlob {
  readonly blob: string;
  readonly path: string;
  readonly content: Buffer;
}

/** What the whole history holds: every path it ever had, and the file versions. */
export interface History {
  /** Every file and folder path in any commit. */
  readonly paths: ReadonlySet<string>;
  /** Every file version, once per blob, except those in `skip`. */
  readonly blobs: readonly HistoryBlob[];
}

/**
 * Reads everything reachable from any branch or tag. Blobs in `skip` (the
 * files already scanned in the working tree) are left out of `blobs`.
 */
export function readHistory(root: string, skip: ReadonlySet<string>): History {
  const pathOf = new Map<string, string>();
  const listing = git(root, ["rev-list", "--all", "--objects"]).toString("utf8");
  for (const line of listing.split("\n")) {
    const space = line.indexOf(" ");
    const id = line.slice(0, space);
    if (space > 0 && line.length > space + 1 && !pathOf.has(id)) {
      pathOf.set(id, line.slice(space + 1));
    }
  }
  const paths = new Set(pathOf.values());
  const candidates = [...pathOf.keys()].filter((id) => !skip.has(id));
  if (candidates.length === 0) {
    return { paths, blobs: [] };
  }
  // Folders have paths too; keep only the files.
  const types = git(
    root,
    ["cat-file", "--batch-check=%(objectname) %(objecttype)"],
    `${candidates.join("\n")}\n`,
  ).toString("utf8");
  const ids = types
    .split("\n")
    .filter((line) => line.endsWith(" blob"))
    .map((line) => line.slice(0, line.indexOf(" ")));
  if (ids.length === 0) {
    return { paths, blobs: [] };
  }
  const batch = git(root, ["cat-file", "--batch"], `${ids.join("\n")}\n`);
  const blobs: HistoryBlob[] = [];
  let offset = 0;
  for (const blob of ids) {
    // Each entry is "<id> blob <size>\n<content>\n".
    const headerEnd = batch.indexOf(10, offset);
    const size = Number(batch.subarray(offset, headerEnd).toString("utf8").split(" ")[2]);
    const content = batch.subarray(headerEnd + 1, headerEnd + 1 + size);
    blobs.push({ blob, path: pathOf.get(blob) ?? "", content });
    offset = headerEnd + 1 + size + 1;
  }
  return { paths, blobs };
}

/** The blob IDs git would give these working-tree files. */
export function blobIdsOf(root: string, files: readonly string[]): Set<string> {
  if (files.length === 0) {
    return new Set();
  }
  const output = git(root, ["hash-object", "--stdin-paths"], `${files.join("\n")}\n`);
  return new Set(output.toString("utf8").split("\n").filter(Boolean));
}
