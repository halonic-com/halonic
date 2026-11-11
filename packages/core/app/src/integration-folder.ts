// Reads one local integration's folder in a workspace, as
// `app.integration-folder` asks: lists it, refuses it on the listing alone
// (links, special files, size), hashes every file, and parses the permission
// sheet from the same bytes it hashed. The trust content (trust build plan
// item 3a, HAL-188) and the check before every runner start
// (`TrustedRunnerStart`) both read a folder this way, so the hash a person
// trusted and the hash checked at a start are made the same way.

import { type FileProblem, type IntegrationSheet, parseFile } from "@halonicjs/format";
import type { Digest, FolderEntry, FolderReader } from "@halonicjs/ports";
import { decodeUtf8, err, ok, type Result } from "@halonicjs/std";
import { type IntegrationFile, integrationCodeDigest } from "@halonicjs/workspace";

/** At most this many files and folders in one integration's folder, as for a plugin, so hashing stays cheap. */
export const MAX_INTEGRATION_ENTRIES = 2_000;

/** At most this many bytes in one integration's files together, as for a plugin. */
export const MAX_INTEGRATION_BYTES = 50 * 1024 * 1024;

/** The permission sheet's name in the folder. */
const SHEET_NAME = "integration.yaml";

/** Something wrong with a local integration's folder, for the CLI and Studio to show. */
export interface IntegrationFolderProblem {
  /** Names the rule, such as `link` or a sheet problem's own code. */
  readonly code: string;
  /** The file it is about, from the integration's folder, such as `integration.yaml`; `""` for the folder itself. */
  readonly file: string;
  /** Where in the sheet, as keys and list indexes; `[]` when it isn't about one value. */
  readonly path: readonly (string | number)[];
  readonly message: string;
  /** For a problem in the sheet: its 1-based line and column. */
  readonly line?: number;
  readonly col?: number;
}

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
 * then hashes every file and parses `integration.yaml` from the bytes it
 * hashed. A symbolic link is refused, never followed or left out, so a link
 * can't change what runs without changing the hash (A12).
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
  const listed = listingProblems(entries, folder);
  if (listed.length > 0) return err(listed);

  const files = new CountingReader(reader, folder);
  const read: IntegrationFile[] = [];
  let sheetText: string | undefined;
  for (const entry of entries) {
    if (entry.kind !== "file") continue;
    const path = inFolder(entry.path, folder);
    const bytes = await files.read(path);
    if (!bytes.ok) return err([bytes.error]);
    read.push({ path, bytes: bytes.value });
    if (path === SHEET_NAME) sheetText = decodeUtf8(bytes.value);
  }
  if (sheetText === undefined) return err([sheetMissingProblem()]);
  // Parsed from the bytes that were hashed, so the sheet checked is the one trusted.
  const parsed = parseFile("integration", sheetText);
  if (!parsed.ok) return err(parsed.error.map(sheetProblem));
  return ok({ sheet: parsed.value.value, code: await integrationCodeDigest(read, digest) });
}

/**
 * Reads files of one integration's folder and counts the bytes, because the
 * listing's sizes can be out of date: a file that grew after the listing
 * stops the reads once the folder's files pass the limit.
 */
class CountingReader {
  readonly #reader: FolderReader;
  readonly #folder: string;
  #bytesRead = 0;

  constructor(reader: FolderReader, folder: string) {
    this.#reader = reader;
    this.#folder = folder;
  }

  /** The bytes of `path`, from the integration's folder, or why they can't be used. */
  async read(path: string): Promise<Result<Uint8Array, IntegrationFolderProblem>> {
    const bytes = await this.#reader.read(`${this.#folder}/${path}`);
    if (bytes === null) return err(changedWhileReadProblem(path));
    this.#bytesRead += bytes.length;
    if (this.#bytesRead > MAX_INTEGRATION_BYTES) return err(tooLargeProblem());
    return ok(bytes);
  }
}

/** Problems the listing alone shows: past a limit, or a link or special file anywhere. */
function listingProblems(
  entries: readonly FolderEntry[],
  folder: string,
): IntegrationFolderProblem[] {
  if (entries.length > MAX_INTEGRATION_ENTRIES) {
    return [
      folderProblem(
        "too-many-files",
        `The integration's folder holds more than ${MAX_INTEGRATION_ENTRIES.toLocaleString("en")} files and folders, the most an integration may have.`,
      ),
    ];
  }
  const bytes = entries.reduce(
    (total, entry) => total + (entry.kind === "file" ? entry.size : 0),
    0,
  );
  if (bytes > MAX_INTEGRATION_BYTES) return [tooLargeProblem()];
  return entries.flatMap((entry): IntegrationFolderProblem[] => {
    const file = inFolder(entry.path, folder);
    if (entry.kind === "link") {
      return [
        fileProblem(
          "link",
          file,
          `${file} is a link. An integration's folder holds only files and folders, so a link can't point Halonic at a file it didn't check.`,
        ),
      ];
    }
    if (entry.kind === "other") {
      return [
        fileProblem(
          "special-file",
          file,
          `${file} is a special file, such as a pipe or a socket. An integration's folder holds only files and folders.`,
        ),
      ];
    }
    return [];
  });
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

function tooLargeProblem(): IntegrationFolderProblem {
  return folderProblem(
    "too-large",
    `The integration's files come to more than ${MAX_INTEGRATION_BYTES / (1024 * 1024)} MB, the most an integration may have.`,
  );
}

function changedWhileReadProblem(file: string): IntegrationFolderProblem {
  return fileProblem(
    "changed-while-read",
    file,
    `${file} was removed while Halonic read the integration. Load it again.`,
  );
}

function sheetProblem(problem: FileProblem): IntegrationFolderProblem {
  const { code, path, message, line, col } = problem;
  return { code, file: SHEET_NAME, path, message, line, col };
}

/** `path` from the integration's folder: `integrations/weather/src/index.js` is `src/index.js` in `integrations/weather`. */
function inFolder(path: string, folder: string): string {
  return path.slice(folder.length + 1);
}

function folderProblem(code: string, message: string): IntegrationFolderProblem {
  return { code, file: "", path: [], message };
}

function fileProblem(code: string, file: string, message: string): IntegrationFolderProblem {
  return { code, file, path: [], message };
}
