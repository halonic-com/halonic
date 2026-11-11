// Reads one local integration's folder in a workspace, as
// `app.integration-folder` asks: lists it, refuses it on the listing alone
// (links, special files, size; the checks in `folder-listing.ts`, shared with
// the plugin folder), parses the permission sheet, then hashes every file,
// the sheet's bytes as parsed included. The trust content (trust build plan
// item 3a, HAL-188) and the check before every runner start
// (`TrustedRunnerStart`) both read a folder this way, so the hash a person
// trusted and the hash checked at a start are made the same way.

import { type FileProblem, type IntegrationSheet, parseFile } from "@halonicjs/format";
import type { Digest, FolderReader } from "@halonicjs/ports";
import { decodeUtf8, err, ok, type Result } from "@halonicjs/std";
import { type IntegrationFile, integrationCodeDigest } from "@halonicjs/workspace";
import {
  CountingReader,
  type FolderNoun,
  type FolderProblem,
  folderProblem,
  inFolder,
  listingProblems,
  MAX_FOLDER_BYTES,
  MAX_FOLDER_ENTRIES,
} from "./folder-listing.ts";

/** At most this many files and folders in one integration's folder, as for a plugin, so hashing stays cheap. */
export const MAX_INTEGRATION_ENTRIES = MAX_FOLDER_ENTRIES;

/** At most this many bytes in one integration's files together, as for a plugin. */
export const MAX_INTEGRATION_BYTES = MAX_FOLDER_BYTES;

/** The permission sheet's name in the folder. */
const SHEET_NAME = "integration.yaml";

/** Something wrong with a local integration's folder, for the CLI and Studio to show. */
export type IntegrationFolderProblem = FolderProblem;

/** How the folder checks' messages name an integration's folder. */
const integrationNoun: FolderNoun = {
  theFolder: "The integration's folder",
  aFolder: "An integration's folder",
  theFiles: "The integration's files",
  one: "an integration",
  it: "the integration",
  withoutGit: "keep it out of the integration's folder",
};

/** A local integration's folder that was read: its sheet and the hash of every file. */
export interface IntegrationFolder {
  /** The permission sheet, parsed from the bytes that were hashed. */
  readonly sheet: IntegrationSheet;
  /** The hash of every file in the folder, from `integrationCodeDigest`. */
  readonly code: string;
}

/**
 * Reads the integration folder `folder` of `reader`, the workspace. It lists
 * the folder and refuses it on its listing alone before reading any bytes,
 * then reads and parses `integration.yaml` before any other file, so a broken
 * sheet costs no more reads, and hashes every file, the sheet's bytes as
 * parsed included. A symbolic link is refused, never followed or left out,
 * so a link can't change what runs without changing the hash (A12).
 *
 * @param reader - the workspace folder
 * @param digest - for the SHA-256 of every file
 * @param folder - the integration's folder, relative to the workspace, such as `integrations/home-station`
 * @returns the sheet and the code hash, or every problem found
 * @throws a `RangeError` for a folder that isn't a clean relative path, and
 *   what the reader or the digest throws, such as a file that became a link
 *   while it was read
 *
 * @example
 * await readIntegrationFolder(workspace, digest, "integrations/home-station");
 * // { ok: true, value: { sheet: { id: "home-station", … }, code: "sha256:3b1f…" } }
 */
export async function readIntegrationFolder(
  reader: FolderReader,
  digest: Digest,
  folder: string,
): Promise<Result<IntegrationFolder, IntegrationFolderProblem[]>> {
  const entries = await reader.entries(folder, { limit: MAX_INTEGRATION_ENTRIES });
  if (entries.length === 0) return err([missingFolderProblem(folder)]);
  const listed = listingProblems(entries, folder, integrationNoun);
  if (listed.length > 0) return err(listed);

  const paths = entries
    .filter((entry) => entry.kind === "file")
    .map((entry) => inFolder(entry.path, folder));
  if (!paths.includes(SHEET_NAME)) return err([sheetMissingProblem()]);

  const files = new CountingReader(reader, folder, integrationNoun);
  const sheetBytes = await files.read(SHEET_NAME);
  if (!sheetBytes.ok) return err([sheetBytes.error]);
  // Parsed from the bytes that are hashed, so the sheet checked is the one trusted.
  const parsed = parseFile("integration", decodeUtf8(sheetBytes.value));
  if (!parsed.ok) return err(parsed.error.map(sheetProblem));

  const read: IntegrationFile[] = [{ path: SHEET_NAME, bytes: sheetBytes.value }];
  for (const path of paths) {
    if (path === SHEET_NAME) continue;
    const bytes = await files.read(path);
    if (!bytes.ok) return err([bytes.error]);
    read.push({ path, bytes: bytes.value });
  }
  return ok({ sheet: parsed.value.value, code: await integrationCodeDigest(read, digest) });
}

function missingFolderProblem(folder: string): IntegrationFolderProblem {
  return folderProblem(
    "folder-missing",
    `${folder} isn't a folder with files in it, so there is no integration to read.`,
  );
}

function sheetMissingProblem(): IntegrationFolderProblem {
  return folderProblem(
    "sheet-missing",
    `The integration's folder has no ${SHEET_NAME}, so Halonic can't tell what its code may do.`,
  );
}

function sheetProblem(problem: FileProblem): IntegrationFolderProblem {
  const { code, path, message, line, col } = problem;
  return { code, file: SHEET_NAME, path, message, line, col };
}
