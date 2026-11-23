// A workspace as one version holds it, for a trust check (HAL-16335): its
// definitions and its local integrations, read from the same place. A run
// starts from the live version's commit, so trust hashes the integrations
// at that commit too, never the saved files beside them.

import {
  savedIntegrations,
  type WorkspaceAtVersion,
} from "@halonicjs/adapter-workspace-engine-node";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";

// The type lives in the workspace engine, which reads trust for it (HAL-17049),
// and so do the integrations' reads, for the watch's versions (HAL-17054).
export {
  integrationsAtCommit,
  savedIntegrations,
  type WorkspaceAtVersion,
} from "@halonicjs/adapter-workspace-engine-node";

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
