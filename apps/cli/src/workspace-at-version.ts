// A workspace as one version holds it, for a trust check (HAL-16335): its
// definitions and its local integrations, read from the same place, so the
// trust checked is on the integrations of the version that is used.

import { workspaceIntegrations } from "@halonicjs/adapter-doctor-node";
import {
  type LoadedWorkspace,
  type LocalIntegrationInput,
  loadWorkspace,
} from "@halonicjs/workspace";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";

/** A workspace's definitions and local integrations, both from one version. */
export interface WorkspaceAtVersion {
  readonly workspace: LoadedWorkspace;
  /** Each local integration, hashed as a runner start hashes it. */
  readonly integrations: readonly LocalIntegrationInput[];
}

/**
 * The saved files as a version: for history off, and for the commands that
 * read the saved files, such as `serve`'s trust gate. `loaded` is the
 * workspace already loaded from them; left out, they are loaded here.
 */
export async function savedVersionOf(
  dir: OpenWorkspaceDir,
  loaded?: LoadedWorkspace,
): Promise<WorkspaceAtVersion> {
  return {
    workspace: loaded ?? (await loadWorkspace(dir.store)),
    integrations: await savedIntegrations(dir),
  };
}

/** The local integrations as saved in the workspace folder, read without following links. */
export async function savedIntegrations(dir: OpenWorkspaceDir): Promise<LocalIntegrationInput[]> {
  return await workspaceIntegrations(dir.root, dir.shown);
}
