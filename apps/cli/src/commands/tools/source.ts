// The connector `halonic tools` works on, found in the workspace: the part
// `review`, `approve` and `revoke` share, so they find a source and fail the
// same way.

import { realpath } from "node:fs/promises";
import { FileToolApprovalStore } from "@halonicjs/adapter-fs-node";
import type { Connector } from "@halonicjs/format";
import type { Digest, ToolApprovalStore } from "@halonicjs/ports";
import { profileFolder, toolApprovalFolder } from "@halonicjs/profile";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { type CommandContext, type CommandInput, OwnLineError, UsageError } from "../../command.ts";
import { type ConnectorMachine, nodeConnectorMachine } from "../../connector-machine.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "../../workspace-runs.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";

/** What `halonic tools` uses on this computer, so tests can fix the servers, the clock and the stores. */
export interface ToolsMachine extends ConnectorMachine {
  /** Where the approvals of listed tools are kept. */
  readonly approvals: ToolApprovalStore;
  readonly digest: Digest;
}

/**
 * The connector machine, and the approvals in the profile folder's
 * `tool-approvals`, which Studio reads too.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function nodeToolsMachine(): ToolsMachine {
  const connectors = nodeConnectorMachine();
  return {
    ...connectors,
    approvals: new FileToolApprovalStore(
      toolApprovalFolder(profileFolder(nodeProfileEnvironment())),
    ),
    digest: webCryptoDigest,
  };
}

/** The connector a `halonic tools` command line names, in the workspace it belongs to. */
export interface ToolSource {
  readonly dir: OpenWorkspaceDir;
  /** The user's own `--dir`, for the commands Halonic suggests. */
  readonly typedDir: string | undefined;
  /** The workspace's name, from `workspace.yaml`. */
  readonly workspace: string;
  /** The workspace as it was loaded: trust is checked on it, with no second read of the files. */
  readonly loaded: LoadedWorkspace;
  /** The workspace's resolved real path: the approvals' key. */
  readonly location: string;
  readonly connector: Connector;
  /** The connector's id, made safe to print. */
  readonly shown: string;
}

/** The `halonic tools` subcommand that names a connector, for its usage error. */
export type ToolsSubcommand = "review" | "approve" | "revoke";

/**
 * The connector named first on the command line.
 *
 * @throws UsageError when no connector is named
 * @throws OwnLineError `not_found` when the workspace has no connector by that id
 */
export async function openToolSource(
  input: CommandInput,
  context: Pick<CommandContext, "cwd">,
  subcommand: ToolsSubcommand,
): Promise<ToolSource> {
  const [typed] = input.positionals;
  if (typed === undefined) {
    throw new UsageError(toolsMessages.nameTheSource(subcommand));
  }
  const dir = await openWorkspaceDir(input, context);
  const loaded = await loadWorkspace(dir.store);
  const connectors = filesOf(loaded, "connector").map((file) => file.value);
  const connector = connectors.find((candidate) => candidate.id === typed);
  if (connector === undefined) {
    const near = nearMatch(
      typed,
      connectors.map((candidate) => candidate.id),
    );
    throw new OwnLineError(
      "not_found",
      toolsMessages.unknownSource(printable(typed), dir.name),
      near === undefined ? toolsMessages.seeConnectors() : toolsMessages.didYouMean(near),
    );
  }
  return {
    dir,
    typedDir: givenDir(input, dir),
    workspace: workspaceNameOf(loaded, dir),
    loaded,
    location: await realpath(dir.root),
    connector,
    shown: printable(connector.id),
  };
}
