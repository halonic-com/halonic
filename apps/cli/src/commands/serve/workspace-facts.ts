import type { WorkspaceFacts } from "@halonicjs/host-server";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { WorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";

/**
 * The id the sample's `workspace.yaml` carries (`examples/acme`). Studio's Open demo and
 * `halonic init --example acme` copy that file unchanged and write no other marker, so
 * the id is what tells a copy of the sample, wherever its folder is (HAL-19432).
 */
export const sampleWorkspaceId = "acme";

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
 * `cli.commands.serve.serve`). The name and the id are read again at every request from
 * the live version, so a rename in `workspace.yaml` shows once it is committed, before
 * any run starts from that commit.
 */
export function servedWorkspaceFacts(
  options: ServedWorkspaceFactsOptions,
): () => Promise<WorkspaceFacts> {
  const { workspace, dir, folder, home } = options;
  return async () => {
    const live = await workspace();
    return {
      name: workspaceNameOf(live, dir),
      // A workspace of a person's own with this id also gets the Demo tag; that only
      // changes what Studio shows, so the id is enough (HAL-19432).
      sample: filesOf(live, "workspace")[0]?.value.id === sampleWorkspaceId,
      folder,
      home,
    };
  };
}
