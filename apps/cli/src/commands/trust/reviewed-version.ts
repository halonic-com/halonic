// The version `halonic trust` and `halonic trust instructions` review (HAL-16335,
// HAL-16386): the one `halonic run` would start, so the trust they save is
// the trust a run checks. Saved changes that aren't committed aren't in it; the
// check names them, so a person knows what it doesn't cover.

import { trustMessages } from "../../messages/trust.ts";
import { loadRunWorkspace, type OpenWorkspaceHistory } from "../../run-workspace.ts";
import { type LoadedVersion, loadVersion } from "../../version-files.ts";
import { savedVersionOf, type WorkspaceAtVersion } from "../../workspace-at-version.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";

/** The version a trust check reviews, and the files it covers that aren't committed. */
export interface ReviewedVersion {
  readonly version: WorkspaceAtVersion;
  /**
   * Each definition file and file under `integrations/` with saved changes
   * that aren't committed, workspace-relative; empty with history off.
   */
  readonly notCommitted: readonly string[];
}

/**
 * The version `halonic run` would start in `dir`: the live version, or the
 * saved files with history off or while nothing is live yet, since a run
 * would then start nothing that needs trust from a commit.
 *
 * @throws HistoryUnavailableError ending "Nothing was trusted." when the
 *   workspace has history but git can't start (exit 9): the saved files are
 *   no fallback, since a run wouldn't start them
 */
export async function reviewedVersion(
  dir: OpenWorkspaceDir,
  openHistory: OpenWorkspaceHistory,
): Promise<ReviewedVersion> {
  const run = await loadRunWorkspace(dir, openHistory, trustMessages.nothingTrusted());
  if (run.found === "nothing-live") {
    return { version: await savedVersionOf(dir), notCommitted: [] };
  }
  return { version: run, notCommitted: run.notCommitted };
}

/** The files `halonic trust instructions` reviews, and the files it covers that aren't committed. */
export interface ReviewedFiles extends LoadedVersion {
  /**
   * Each definition file and file under `integrations/` with saved changes
   * that aren't committed, workspace-relative; empty with history off.
   */
  readonly notCommitted: readonly string[];
}

/**
 * The agents' and skills' files of the version `halonic run` would start in
 * `dir`, as {@link reviewedVersion} picks it, read as the run reads them
 * (HAL-16386), so trusting an agent's instructions clears the run's refusal.
 *
 * @throws HistoryUnavailableError ending "Nothing was trusted." when the
 *   workspace has history but git can't start (exit 9)
 */
export async function reviewedFiles(
  dir: OpenWorkspaceDir,
  openHistory: OpenWorkspaceHistory,
): Promise<ReviewedFiles> {
  const run = await loadRunWorkspace(dir, openHistory, trustMessages.nothingTrusted());
  if (run.found === "nothing-live") {
    return { ...(await loadVersion(dir.store)), notCommitted: [] };
  }
  const { workspace, fileTexts, notCommitted } = run;
  return { workspace, fileTexts, notCommitted };
}
