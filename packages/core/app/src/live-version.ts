// Which version of the workspace is live (save model 2.2–2.5, HAL-3246):
// the latest commit, whose files Run, routines and triggers read. Saved
// changes aren't live until they are in a version.

import type { Vcs, VcsCommit } from "@halonicjs/ports";

/**
 * The workspace's live version:
 * - `history-off`: the workspace isn't kept in version control, so every
 *   run reads the saved files and there is nothing to make live;
 * - `none-yet`: it is, but has no version yet, so no item is live;
 * - `commit`: the latest commit on the current branch (HEAD).
 */
export type LiveVersion =
  | { readonly kind: "history-off" }
  | { readonly kind: "none-yet" }
  | { readonly kind: "commit"; readonly commit: VcsCommit };

/** The part of {@link Vcs} {@link liveVersionOf} asks. */
export type LiveVersionReader = Pick<Vcs, "status" | "log">;

/**
 * Finds the workspace's live version. Read it once and pass it on, so the
 * items a screen shows, or the files a run reads, all come from the same
 * version even when a new one is made meanwhile.
 *
 * @param vcs - the workspace's version control, or `null` for a workspace
 *   opened without it
 *
 * @example
 * const live = await liveVersionOf(vcs);
 * if (live.kind === "commit") show(`Runs the live version from ${live.commit.date}`);
 */
export async function liveVersionOf(vcs: LiveVersionReader | null): Promise<LiveVersion> {
  if (vcs === null || !(await vcs.status()).isRepo) {
    return { kind: "history-off" };
  }
  const [head] = await vcs.log(1);
  return head === undefined ? { kind: "none-yet" } : { kind: "commit", commit: head };
}
