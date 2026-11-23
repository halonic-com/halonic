// One version a watch reads, and how it is loaded (HAL-17054): with its
// local integrations from the same version, and Local only counted on once
// the saved workspace.yaml says on (`app.saved-local-only`).

import type { LiveVersion } from "@halonicjs/app";
import { withSavedLocalOnly } from "@halonicjs/app/saved-local-only";
import type { RunVersion } from "@halonicjs/events";
import type { DefinitionSource } from "@halonicjs/ports";
import { filesOf, type LoadedWorkspace, type LocalIntegrationInput } from "@halonicjs/workspace";
import { type LoadedVersion, loadVersion } from "./loaded-version.ts";
import type { WorkspaceAtVersion } from "./workspace-trust-state.ts";

/**
 * A version's load, with its local integrations read from the same version;
 * `localOnlySaved` when the saved workspace.yaml turned its Local only on.
 */
export interface WatchedVersion extends LoadedVersion, WorkspaceAtVersion {
  readonly localOnlySaved?: true;
}

/** Loads the workspace from `source`, with `integrations`, read from the same version. */
export async function loadWatched(
  source: DefinitionSource,
  integrations: readonly LocalIntegrationInput[],
): Promise<WatchedVersion> {
  return { ...(await loadVersion(source)), integrations };
}

/**
 * `loaded`, with Local only on when the saved `workspace.yaml` says on
 * (`app.saved-local-only`). Only the flag changes: the trust check reads
 * the connectors, agents, providers and integrations, which stay as loaded.
 *
 * @throws KindedError `invalid_input` when `loaded` has Local only off and
 *   the saved `workspace.yaml` can't be read or has an error
 */
export async function withSavedLocalOnlyOf(
  loaded: WatchedVersion,
  saved: DefinitionSource,
): Promise<WatchedVersion> {
  const workspace = await withSavedLocalOnly(loaded.workspace, saved);
  return workspace === loaded.workspace ? loaded : { ...loaded, workspace, localOnlySaved: true };
}

/**
 * The version a read of the live version loads: the commit, the saved files
 * with history off, or none, the one read last, when the history has no
 * commit any more.
 */
export function runVersionOfLive(live: LiveVersion): RunVersion | undefined {
  switch (live.kind) {
    case "commit":
      return { reads: "live-version", commit: live.commit.hash, versionDate: live.commit.date };
    case "history-off":
      return { reads: "saved-files" };
    case "none-yet":
      return undefined;
  }
}

/** Whether the workspace is local only; without a workspace.yaml that parsed, the format default: not. */
export function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}
