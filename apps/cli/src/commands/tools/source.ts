// The connector `halonic tools` works on, found in the workspace, and its
// listed tools checked against the approvals: the part `review`, `approve`
// and `revoke` share, so they find a source and fail the same way.

import { realpath } from "node:fs/promises";
import { FileToolApprovalStore } from "@halonicjs/adapter-fs-node";
import { checkConnectorTools, type ListedToolApprovalCheck } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type { Digest, ToolApprovalStore } from "@halonicjs/ports";
import { profileFolder, toolApprovalFolder } from "@halonicjs/profile";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { type CommandContext, type CommandInput, OwnLineError, UsageError } from "../../command.ts";
import { type ConnectorMachine, nodeConnectorMachine } from "../../connector-machine.ts";
import { suggestedCommand } from "../../messages/suggested-command.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { shellWord } from "../../output/shell-word.ts";
import { readSourceListing } from "../../source-listing.ts";
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

/**
 * The source's listed tools now, checked against its approvals. A
 * connector whose tools are built in, such as Google, lists none, and gets
 * `built_in`.
 *
 * @throws NotTrustedError when the workspace isn't trusted as it is now (exit 3): nothing starts
 * @throws OwnLineError when Halonic refused the whole listing, or an approval can't be read
 */
export async function checkToolSource(
  source: ToolSource,
  machine: ToolsMachine,
  context: Pick<CommandContext, "secrets">,
): Promise<ListedToolApprovalCheck | "built_in"> {
  if ("google" in source.connector.transport) {
    return "built_in";
  }
  const listing = await readSourceListing(
    {
      dir: source.dir,
      typedDir: source.typedDir,
      connector: source.connector,
      workspace: source.loaded,
    },
    machine,
    context.secrets,
    toolsMessages.nothingStarted(),
  );
  const check = await checkConnectorTools({
    location: source.location,
    connector: source.connector,
    listed: listing.tools,
    trust: listing.trust,
    store: machine.approvals,
    digest: machine.digest,
    clock: machine.clock,
  });
  if (!check.ok) {
    throw new OwnLineError("denied", toolsMessages.cantList(source.shown, printable(check.error)));
  }
  return usableCheck(check.value, source);
}

/** The check, unless none of its listed tools can be on: then why, as the error. */
function usableCheck(check: ListedToolApprovalCheck, source: ToolSource): ListedToolApprovalCheck {
  const refusal = check.refusals.find((found) => found.refused === "listing");
  if (refusal !== undefined) {
    throw new OwnLineError(
      "denied",
      toolsMessages.listingRefused(source.shown, printable(refusal.reason)),
    );
  }
  if (check.unreadable !== null) {
    const { toolName } = check.unreadable;
    if (toolName === null) {
      throw new OwnLineError("unavailable", toolsMessages.unreadableUnnamed(source.shown));
    }
    throw new OwnLineError(
      "unavailable",
      toolsMessages.unreadable(printable(toolName), source.shown),
      toolsMessages.unreadableFix(toolsCommand("revoke", source, shellWord(toolName))),
    );
  }
  return check;
}

/**
 * A `halonic tools` command Halonic suggests, with the user's own `--dir`.
 *
 * @example
 * toolsCommand("review", source); // "halonic tools review notes-mcp"
 * toolsCommand("approve", source, "search --fingerprint htl1:…");
 */
export function toolsCommand(subcommand: string, source: ToolSource, rest = ""): string {
  const words =
    rest === "" ? shellWord(source.connector.id) : `${shellWord(source.connector.id)} ${rest}`;
  return suggestedCommand(`tools ${subcommand}`, source.typedDir, words);
}
