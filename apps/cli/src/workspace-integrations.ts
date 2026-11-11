// The workspace's local integrations, as the trust check reads them (trust
// build plan items 3a and 8a, HAL-188): every folder directly under
// `integrations/` that holds an `integration.yaml`. Each is read with
// `readIntegrationFolder`, the way the check before every runner start
// (`TrustedRunnerStart`) reads it, so the code hash a person trusts is the
// one checked when the integration starts.

import { type IntegrationFolder, readIntegrationFolder } from "@halonicjs/app";
import type { Digest, FolderEntry, FolderReader } from "@halonicjs/ports";
import type { LocalIntegrationInput } from "@halonicjs/workspace";

/** The workspace's folder for local integrations, one folder each. */
export const integrationsFolder = "integrations";

/** The permission sheet that makes a folder an integration. */
const sheetName = "integration.yaml";

/**
 * The local integrations in `workspace`'s `integrations/` folder, in the
 * order of their folders' names.
 *
 * A folder that can't be read as an integration, such as one with a link
 * in it, a sheet that doesn't parse or a file that can't be read, is left
 * out, as `loadWorkspace` leaves out a file with an error. So is a folder
 * whose id an earlier folder already has, and every folder when
 * `integrations/` itself can't be listed. A left-out integration is in no
 * trust, so its runner never starts (`not-in-trust`).
 *
 * A workspace doesn't hold settings for its integrations yet, so each gets
 * none, and a `{ fromSetting }` host shows as "not set" in the trust check.
 *
 * @param workspace - the workspace folder, read without following links
 * @param digest - for the hash of every file, the one the runner start uses
 *
 * @example
 * await readLocalIntegrations(new FileSystemFolderReader("/work/acme"), webCryptoDigest);
 * // [{ sheet: { id: "home-station", … }, settings: {}, folder: "integrations/home-station", code: "sha256:3b1f…" }]
 */
export async function readLocalIntegrations(
  workspace: FolderReader,
  digest: Digest,
): Promise<LocalIntegrationInput[]> {
  const integrations: LocalIntegrationInput[] = [];
  const ids = new Set<string>();
  for (const folder of await integrationFolders(workspace)) {
    const read = await readFolder(workspace, digest, folder);
    if (read === undefined || ids.has(read.sheet.id)) continue;
    ids.add(read.sheet.id);
    integrations.push({ sheet: read.sheet, settings: {}, folder, code: read.code });
  }
  return integrations;
}

/**
 * The integration in `folder`, or `undefined` when it can't be read as one.
 * That includes a reader that throws, such as for a name with a backslash
 * in it or a file that became a link while it was read, so one such folder
 * doesn't stop the trust check of the whole workspace.
 */
async function readFolder(
  workspace: FolderReader,
  digest: Digest,
  folder: string,
): Promise<IntegrationFolder | undefined> {
  try {
    const read = await readIntegrationFolder(workspace, digest, folder);
    return read.ok ? read.value : undefined;
  } catch {
    return undefined;
  }
}

/** Every folder directly under `integrations/` with an `integration.yaml` in it, by name. */
async function integrationFolders(workspace: FolderReader): Promise<string[]> {
  const folders: string[] = [];
  for (const entry of await integrationsEntries(workspace)) {
    if (entry.kind !== "folder") continue;
    if (await holdsSheet(workspace, entry.path)) folders.push(entry.path);
  }
  return folders.sort(compareText);
}

/**
 * What's directly in `integrations/`. When the reader refuses to list it,
 * such as when `integrations/` is itself a link or can't be read, the
 * workspace has no local integrations: the trust check of everything else
 * goes on, and a runner start reads the folder again and refuses it.
 */
async function integrationsEntries(workspace: FolderReader): Promise<readonly FolderEntry[]> {
  try {
    return await workspace.entries(integrationsFolder, { recursive: false });
  } catch {
    return [];
  }
}

/**
 * Whether `folder` has an `integration.yaml` directly in it. A folder the
 * reader refuses to list, such as one with a backslash in its name, holds
 * none, so it doesn't stop the trust check of the whole workspace.
 */
async function holdsSheet(workspace: FolderReader, folder: string): Promise<boolean> {
  try {
    const inside = await workspace.entries(folder, { recursive: false });
    return inside.some((file) => isSheet(file, folder));
  } catch {
    return false;
  }
}

function isSheet(entry: FolderEntry, folder: string): boolean {
  return entry.path === `${folder}/${sheetName}`;
}

/** Compares by code unit, so the order is the same on every machine and locale. */
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
