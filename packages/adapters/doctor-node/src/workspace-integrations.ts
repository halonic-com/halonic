import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { connectorFiles, readLocalIntegrations } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type { LocalIntegrationInput } from "@halonicjs/workspace";
import { webCryptoDigest } from "./web-crypto-digest.ts";

/**
 * The local integrations in the workspace folder `root`, read without
 * following links and hashed as a runner start hashes them. Every command
 * that checks trust reads them this way, so they all see the same code.
 *
 * @param root - the workspace folder
 * @param shown - the folder as the user typed it, such as `./acme`
 */
export async function workspaceIntegrations(
  root: string,
  shown: string,
): Promise<LocalIntegrationInput[]> {
  return await readLocalIntegrations(new FileSystemFolderReader(root, shown), webCryptoDigest);
}

/**
 * The hash of each workspace file each stdio connector's start names, read
 * from the workspace folder `root` without following links. The programs run
 * from this folder, not from a version in the history, so these are the
 * files they run. Every command that checks trust reads them this way.
 *
 * @param root - the workspace folder
 * @param shown - the folder as the user typed it, such as `./acme`
 */
export async function workspaceConnectorFiles(
  root: string,
  shown: string,
  connectors: readonly Connector[],
): Promise<Map<string, Record<string, string>>> {
  return await connectorFiles(connectors, new FileSystemFolderReader(root, shown), webCryptoDigest);
}
