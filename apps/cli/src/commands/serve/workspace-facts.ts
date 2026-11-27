import type { WorkspaceFacts } from "@halonicjs/host-server";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { Phrase } from "../../messages/phrase.ts";
import type { WorkspaceDir } from "../../workspace-dir.ts";
import { readWorkspaceTemplate } from "../../workspace-template.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";

/** What the served workspace's facts are read from. */
export interface ServedWorkspaceFactsOptions {
  /** Reads the live version at every request, so a committed rename shows at once. */
  readonly workspace: () => Promise<LoadedWorkspace>;
  /** Reads the saved `template.yaml` at every request: its text, or `null` when there is none. */
  readonly template: () => Promise<string | null>;
  /** Shows the `!` line for a template that can't be read. */
  readonly warn: (line: Phrase) => void;
  /** The workspace folder as it was given, for the name of a workspace whose file names none. */
  readonly dir: WorkspaceDir;
  /** The workspace's real folder. */
  readonly folder: string;
  /** The real home folder of this computer's profile. */
  readonly home: string;
}

/**
 * Which workspace `halonic serve` shows, for `GET /api/workspace` (requirement
 * `cli.commands.serve.serve`). The name is read again at every request from the live
 * version, so a rename in `workspace.yaml` shows once it is committed, before
 * any run starts from that commit. `sample` is true when the workspace's
 * `template.yaml` says `kind: demo`; that only changes what Studio shows.
 */
export function servedWorkspaceFacts(
  options: ServedWorkspaceFactsOptions,
): () => Promise<WorkspaceFacts> {
  const { workspace, template, warn, dir, folder, home } = options;
  // One `!` line while the template stays unreadable, not one per request.
  let warned = false;
  return async () => {
    const read = readWorkspaceTemplate(await template());
    if (!read.ok && !warned) warn(read.warning);
    warned = !read.ok;
    return {
      name: workspaceNameOf(await workspace(), dir),
      sample: read.ok && read.template?.kind === "demo",
      folder,
      home,
    };
  };
}
