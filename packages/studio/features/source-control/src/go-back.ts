import type { VcsChange } from "@halonicjs/ports";
import type { ChangesSource } from "./api.ts";
import type { ChangesListState } from "./changes-list-state.ts";
import { goBackWords } from "./changes-words.ts";
import { loadFailureReason } from "./load-failure.ts";
import { type RestoreOutcome, restoreItem } from "./restore-item.ts";
import { versionMessage, versionPaths } from "./version-name.ts";

/**
 * Go back (checklist part 2, 2.9; design-source-control, "what happens in git"): changes that
 * aren't in a version yet are first kept as the version "Before going back", then every file of
 * the workspace folder is put as the version `versionId` has it, deleting the files it doesn't
 * have. Nothing is erased: History only grows, and the files show as changes afterwards. Never
 * `reset`, `checkout` or `stash`.
 *
 * The files are written as Restore just this writes them, so the outcome is the same: a copy is
 * kept first, a file that fails puts the others back, and Undo puts every file back as it was
 * after "Before going back". Undo leaves that version in History.
 *
 * When every file already is as the version has it and no file is new to git, nothing is kept
 * and nothing is written: a second press records no second "Before going back" (C289 GB1).
 *
 * The files to write are listed after "Before going back" is kept: a file git didn't know yet is
 * only in that list once that version holds it, and it has to be deleted too.
 */
export async function goBack(source: ChangesSource, versionId: string): Promise<RestoreOutcome> {
  let paths: readonly string[];
  try {
    const changes = await readChanges(source);
    const differing = await source.listChangedSince(versionId);
    const hasNewFiles = changes.some((change) => change.status === "untracked");
    if (differing.length === 0 && !hasNewFiles) return { kind: "unchanged" };
    await keepBeforeGoingBack(source, changes);
    paths = await source.listChangedSince(versionId);
  } catch (error) {
    return { kind: "failed", reason: loadFailureReason(error) };
  }
  return restoreItem(source, versionId, paths);
}

/**
 * Puts every file that differs from the version `versionId` as that version has it, without
 * keeping anything as a version first: Try again after a partial Go back, which already did.
 */
export async function putAsVersion(
  source: ChangesSource,
  versionId: string,
): Promise<RestoreOutcome> {
  let paths: readonly string[];
  try {
    paths = await source.listChangedSince(versionId);
  } catch (error) {
    return { kind: "failed", reason: loadFailureReason(error) };
  }
  return restoreItem(source, versionId, paths);
}

/** The changes that aren't in a version yet; none when there is no history to read. */
async function readChanges(source: ChangesSource): Promise<readonly VcsChange[]> {
  const read = await source.read();
  return read.kind === "ready" ? read.changes : [];
}

/** Records `changes`, the ones that aren't in a version yet, as "Before going back"; none, nothing. */
async function keepBeforeGoingBack(
  source: ChangesSource,
  changes: readonly VcsChange[],
): Promise<void> {
  if (changes.length === 0) return;
  const message = versionMessage(goBackWords.beforeGoingBack, "");
  await source.createVersion({ message, paths: versionPaths(changes) });
}

/**
 * Whether a version newer than `versionId` is shared already, so going back can't take it back
 * from the team: there is a shared copy and History has a newer version it doesn't lack.
 */
export function sharedAfter(
  state: Pick<ChangesListState, "hasRemote" | "unsharedIds" | "history">,
  versionId: string,
): boolean {
  if (!state.hasRemote) return false;
  const { versions } = state.history;
  const at = versions.findIndex((version) => version.id === versionId);
  return versions.slice(0, Math.max(at, 0)).some((version) => !state.unsharedIds.has(version.id));
}
