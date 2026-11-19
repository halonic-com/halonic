// The connector `halonic tools` works on, found in the workspace, and its
// listed tools checked against the approvals: the part `review`, `approve`
// and `revoke` share, so they find a source and fail the same way.

import { realpath } from "node:fs/promises";
import { FileToolApprovalStore } from "@halonicjs/adapter-fs-node";
import { checkConnectorTools, type ListedToolApprovalCheck } from "@halonicjs/app/listed-tools";
import type { Connector } from "@halonicjs/format";
import { connectorStartFailureOf, type Digest, type ToolApprovalStore } from "@halonicjs/ports";
import { profileFolder, toolApprovalFolder } from "@halonicjs/profile";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type JsonFields,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { type ConnectorMachine, nodeConnectorMachine } from "../../connector-machine.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { suggestedCommand } from "../../messages/suggested-command.ts";
import { toolsMessages } from "../../messages/tools.ts";
import { nearMatch } from "../../near-match.ts";
import { printable } from "../../output/printable.ts";
import { shellWord } from "../../output/shell-word.ts";
import { readSourceListing, type SourceListing } from "../../source-listing.ts";
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
  /** The connector's file, relative to the workspace, such as `library/connectors/notes.connector.yaml`. */
  readonly file: string;
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
  const files = filesOf(loaded, "connector");
  const found = files.find((candidate) => candidate.value.id === typed);
  if (found === undefined) {
    const near = nearMatch(
      typed,
      files.map((candidate) => candidate.value.id),
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
    connector: found.value,
    file: found.path,
    shown: printable(found.value.id),
  };
}

/**
 * Why a connector has no listed tools to approve: its tools are built into
 * Halonic (`built_in`, such as Google's), or it is a plugin's connector,
 * whose tools the plugin's trust already covers (`plugin`).
 */
export type NoToolsToApprove = "built_in" | "plugin";

/**
 * The source's listed tools now, checked against its approvals, or why it
 * has none to approve. A plugin's connector isn't started for this: its
 * tools need no approval.
 *
 * @throws NotTrustedError when the workspace isn't trusted as it is now (exit 3): nothing starts
 * @throws OwnLineError when Halonic refused the whole listing, or an approval can't be read
 * @throws OwnLineError `not_found` when the connector's program isn't on this computer, or a
 *   secret it needs isn't set (cli.commands.tools.start-failure)
 */
export async function checkToolSource(
  source: ToolSource,
  machine: ToolsMachine,
  context: Pick<CommandContext, "secrets">,
): Promise<ListedToolApprovalCheck | NoToolsToApprove> {
  if ("google" in source.connector.transport) {
    return "built_in";
  }
  if ("plugin" in source.connector.transport) {
    return "plugin";
  }
  let listing: SourceListing;
  try {
    listing = await readSourceListing(
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
  } catch (error) {
    throw startFailureError(error, source) ?? error;
  }
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

/**
 * The error that says why the connector didn't start, when it's one the
 * person can fix themselves (`connectorStartFailureOf`): its program isn't on
 * this computer, or a secret it needs isn't set. `undefined` for any other
 * error, which keeps its own line. It names the program or the secret, never
 * the error's message or a secret's value.
 */
function startFailureError(error: unknown, source: ToolSource): OwnLineError | undefined {
  const failure = connectorStartFailureOf(error);
  if (failure === undefined) return undefined;
  if (failure.reason === "program-missing") {
    return new OwnLineError(
      "not_found",
      toolsMessages.programMissing(source.shown, printable(failure.program)),
      toolsMessages.programMissingFix(printable(source.file)),
    );
  }
  const secret = printable(failure.secret);
  return new OwnLineError(
    "not_found",
    toolsMessages.secretNotSet(source.shown, secret),
    toolsMessages.secretNotSetFix(shellWord(failure.secret)),
  );
}

/**
 * What `review` and `approve` say, and exit 0 on, for a connector with no
 * listed tools to approve. `--json` gets the reason as `needsNoApproval`.
 */
export function noToolsToApprove(
  why: NoToolsToApprove,
  source: ToolSource,
): { readonly line: Phrase; readonly json: JsonFields } {
  const said =
    why === "plugin"
      ? toolsMessages.pluginTools(source.shown)
      : toolsMessages.onlyBuiltIn(source.shown);
  return { line: said.phrase, json: { needsNoApproval: why } };
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
