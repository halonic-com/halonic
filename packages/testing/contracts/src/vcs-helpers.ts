import type { VcsChange, VcsStatus } from "@halonicjs/ports";
import type { VcsHarness } from "./vcs-harness.ts";

/** A full git commit hash: SHA-1 today, SHA-256 in repositories that use it. */
export const commitHash = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** Stages one file's new content and commits it; returns the commit hash. */
export async function commitFile(
  { vcs, files }: VcsHarness,
  path: string,
  content: string,
  message: string,
): Promise<string> {
  await files.write(path, content);
  await vcs.stage([path]);
  return vcs.commit(message);
}

/** The changes in a fixed order, because the port doesn't promise one. */
export async function changesOf(status: Promise<VcsStatus>): Promise<VcsChange[]> {
  return sortChanges((await status).changes);
}

/** The changes sorted by path, unstaged before staged. */
export function sortChanges(changes: VcsChange[]): VcsChange[] {
  return [...changes].sort(
    (a, b) => compare(a.path, b.path) || Number(a.staged) - Number(b.staged),
  );
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** A diff's lines, to look for some without depending on the rest. */
export function lines(diff: string): string[] {
  return diff.split("\n");
}
