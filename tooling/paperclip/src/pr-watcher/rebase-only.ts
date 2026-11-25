import { createHash } from "node:crypto";
import { branchPath, type PullDetails } from "../pr-tools/pr-status.ts";
import type { PullFacts } from "./decide.ts";
import type { GitHubGet } from "./github.ts";

/** Whether only a rebase changed a pull request since the approved head (HAL-17759). */
export type RebaseOnly = (pull: PullFacts, approvedHead: string) => Promise<boolean>;

/** One changed file of a compare, as the REST API lists it. */
export interface CompareFile {
  readonly filename?: string;
  readonly previous_filename?: string;
  readonly status?: string;
  readonly patch?: string;
}

/** GitHub lists at most this many files in a compare; a longer one can't be judged. */
const compareFileLimit = 300;

/** A hunk's header names its line numbers, which a rebase moves; its body is the change. */
function changeOf(patch: string): string {
  return patch.replace(/^@@ [^@]* @@/gm, "@@");
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
    if (file.patch === undefined && file.status !== "renamed") {
      return undefined;
    }
    const from = file.previous_filename === undefined ? "" : `${file.previous_filename} -> `;
    byName.set(
      `${from}${file.filename ?? ""}`,
      `${file.status ?? ""}\n${changeOf(file.patch ?? "")}`,
    );
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

/**
 * The approximate `git range-diff` the watcher can do read-only: the base
 * branch compared with the approved head and with the current head, each
 * from its merge base, so the pull request's own change on both sides. Equal
 * changes mean only a rebase; a conflict fix, a new commit or a moved
 * context line counts as a real change, so the reviewer of the paths sees
 * it. Three GET requests. A stacked pull request the watcher rebased off a
 * merged base (HAL-18031) was approved against that base, so its approved
 * side is compared from the base's last head, which `stackBase` names.
 */
export function gitHubRebaseOnly(
  get: GitHubGet,
  stackBase: (pull: string, approvedHead: string) => string | undefined = () => undefined,
): RebaseOnly {
  return async ({ repo, number, head }, approvedHead) => {
    const pull = (await get(`/repos/${repo}/pulls/${number}`)) as PullDetails;
    const base = branchPath(pull.base.ref);
    const approvedBase = stackBase(`${repo}#${number}`, approvedHead) ?? base;
    const [before, after] = (await Promise.all([
      get(`/repos/${repo}/compare/${approvedBase}...${approvedHead}`),
      get(`/repos/${repo}/compare/${base}...${head}`),
    ])) as { files?: CompareFile[] }[];
    return sameChanges(before?.files ?? [], after?.files ?? []);
  };
}
