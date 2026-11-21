import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { readLocalIntegrations } from "@halonicjs/app";
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
