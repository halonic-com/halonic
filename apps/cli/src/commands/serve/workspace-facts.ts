import type { WorkspaceFacts } from "@halonicjs/host-server";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { WorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";

/** What the served workspace's facts are read from. */
export interface ServedWorkspaceFactsOptions {
  /** Reads the live version at every request, so a committed rename shows at once. */
  readonly workspace: () => Promise<LoadedWorkspace>;
  /** The workspace folder as it was given, for the name of a workspace whose file names none. */
  readonly dir: WorkspaceDir;
  /** The workspace's real folder. */
  readonly folder: string;
  /** The real home folder of this computer's profile. */
  readonly home: string;
}

/**
 * Which workspace `halonic serve` shows, for `GET /api/workspace` (requirement
 * `cli.commands.serve`). The name is read again at every request from the live
 * version, so a rename in `workspace.yaml` shows once it is committed, before
 * any run starts from that commit.
 */
export function servedWorkspaceFacts(
  options: ServedWorkspaceFactsOptions,
): () => Promise<WorkspaceFacts> {
  const { workspace, dir, folder, home } = options;
  return async () => ({
    name: workspaceNameOf(await workspace(), dir),
    // No workspace is marked as the sample yet: Welcome has none until HAL-9089 is decided.
    sample: false,
    folder,
    home,
  });
}
