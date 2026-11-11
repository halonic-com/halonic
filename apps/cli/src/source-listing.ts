// Reads one workspace source's tool listing outside a run, for
// `halonic tools review | approve` (HAL-2827), so the person approves the
// fingerprint of what they see.

import { connectorConfigOf } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type { ConnectorTool, Secrets } from "@halonicjs/ports";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { ConnectorMachine } from "./connector-machine.ts";
import type { Message } from "./messages/define.ts";
import { realWorkingFolders } from "./working-folders.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { trustedGrant } from "./workspace-trust.ts";

/** The source whose tools are read, in the workspace it belongs to. */
export interface SourceListingTarget {
  readonly dir: OpenWorkspaceDir;
  /** The folder as the user typed it, for the fix line of a refusal. */
  readonly typedDir: string | undefined;
  /** The source's connector file, as the workspace loaded it. */
  readonly connector: Connector;
  /**
   * The workspace the source belongs to, for its harness agents' working
   * folders: a `stdio` program that would run or load a file from one of
   * them doesn't start (HAL-4739).
   */
  readonly workspace: LoadedWorkspace;
}

/**
 * The tools `target`'s source lists now, as its server wrote them: fence
 * them with `readToolListing` before they are shown. The workspace must be
 * trusted first, so an untrusted workspace starts no program and reaches no
 * server; the factory checks the grant again on its own. A `stdio` program
 * that would run or load a file from a harness agent's working folder is
 * refused before it starts.
 *
 * @param secrets - the command's `context.secrets`, so every value read is scrubbed from what it prints
 * @param nothingDone - the end of line 1 of a refusal, saying nothing happened
 * @throws NotTrustedError when the workspace isn't trusted as it is now (exit 3)
 */
export async function readSourceListing(
  target: SourceListingTarget,
  machine: ConnectorMachine,
  secrets: Secrets,
  nothingDone: Message,
): Promise<ConnectorTool[]> {
  const trust = await trustedGrant(target.dir, machine, target.typedDir, nothingDone);
  return await machine.factories.listTools(connectorConfigOf(target.connector), {
    secrets,
    tokens: machine.tokens,
    http: machine.http,
    workspaceRoot: target.dir.root,
    workingFolders: await realWorkingFolders(target.dir.root, target.workspace),
    trust,
  });
}
