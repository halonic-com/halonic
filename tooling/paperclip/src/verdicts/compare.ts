/**
 * A compare's changes, line numbers aside: what the verdict gate's
 * fingerprint and the PR watcher's rebase-only check read. Kept here so a
 * routine review can't change it (HAL-20010); `pr-watcher/rebase-only.ts`
 * re-exports it.
 */
import { createHash } from "node:crypto";

/** One changed file of a compare, as the REST API lists it. */
export interface CompareFile {
  readonly filename?: string;
  readonly previous_filename?: string;
  readonly status?: string;
  readonly patch?: string;
  /** The file's blob after the change. */
  readonly sha?: string;
}

/** GitHub lists at most this many files in a compare; a longer one can't be judged. */
const compareFileLimit = 300;

/** A hunk's header names its line numbers, which a rebase moves; its body is the change. */
function changeOf(patch: string): string {
  return patch.replace(/^@@ [^@]* @@/gm, "@@");
}

/**
 * A file's change, line numbers aside. A renamed file GitHub lists without a
 * patch (a pure rename, or a binary or very large file) counts by its content,
 * its blob, so a change hidden behind the missing patch still shows (HAL-19481).
 */
function changeOfFile(file: CompareFile): string | undefined {
  if (file.patch !== undefined) {
    return changeOf(file.patch);
  }
  return file.status === "renamed" && file.sha !== undefined ? `blob ${file.sha}` : undefined;
}

/**
 * Each file's change by name, or undefined when one can't be compared:
 * GitHub leaves out the patch of a binary or very large file.
 */
function changes(files: readonly CompareFile[]): Map<string, string> | undefined {
  if (files.length >= compareFileLimit) {
    return undefined;
  }
  const byName = new Map<string, string>();
  for (const file of files) {
    const change = changeOfFile(file);
    if (change === undefined) {
      return undefined;
    }
    const from = file.previous_filename === undefined ? "" : `${file.previous_filename} -> `;
    byName.set(`${from}${file.filename ?? ""}`, `${file.status ?? ""}\n${change}`);
  }
  return byName;
}

/** The same files with the same changes, line numbers aside. */
export function sameChanges(
  before: readonly CompareFile[],
  after: readonly CompareFile[],
): boolean {
  const old = changes(before);
  const now = changes(after);
  return (
    old !== undefined &&
    now !== undefined &&
    old.size === now.size &&
    [...old].every(([name, change]) => now.get(name) === change)
  );
}

/**
 * A fingerprint of a compare's changes, line numbers aside, or null when
 * one can't be compared. Two compares with the same fingerprint have the
 * same changes (`sameChanges`), so the Merger uses it in place of
 * `git patch-id`, which needs git (HAL-18460).
 */
export function changeIdOf(files: readonly CompareFile[]): string | null {
  const byName = changes(files);
  if (byName === undefined) {
    return null;
  }
  const hash = createHash("sha256");
  for (const [name, change] of [...byName].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${name}\0${change}\0`);
  }
  return hash.digest("hex");
}
