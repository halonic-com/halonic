// A workspace as one version holds it, for a trust check (HAL-16335): its
// definitions and its local integrations, read from the same place. A run
// starts from the live version's commit, so trust hashes the integrations
// at that commit too, never the saved files beside them.

import { workspaceIntegrations } from "@halonicjs/adapter-doctor-node";
import type { WorkspaceAtVersion } from "@halonicjs/adapter-workspace-engine-node";
import { readLocalIntegrations } from "@halonicjs/app";
import {
  type LoadedWorkspace,
  type LocalIntegrationInput,
  loadWorkspace,
  VersionFolder,
  type VersionReader,
} from "@halonicjs/workspace";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

// The type lives in the workspace engine, which reads trust for it (HAL-17049).
export type { WorkspaceAtVersion } from "@halonicjs/adapter-workspace-engine-node";

/**
 * The local integrations at `commit`, read through the history only, so
 * an integration saved but not committed is as the commit has it.
 *
 * @param location - where the workspace lives, as its saved store says
 */
export async function integrationsAtCommit(
  vcs: VersionReader,
  commit: string,
  location: string,
): Promise<LocalIntegrationInput[]> {
  return await readLocalIntegrations(new VersionFolder(vcs, commit, location), webCryptoDigest);
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
