import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { TrustRecord, TrustStore } from "@halonicjs/ports";
import { isMissing } from "./links.ts";
import { makePrivateFolder } from "./private-files.ts";

/** A record's file name: the SHA-256 of its location's UTF-16 code units in lower-case hex, then `.json`. */
const recordFile = /^[0-9a-f]{64}\.json$/u;

/** The location at the start of a record file, as `grant` writes it, even when the rest is damaged. */
const leadingLocation = /^\s*\{\s*"location"\s*:\s*("(?:[^"\\\n]|\\.)*")/u;

/**
 * Trust records as files in one folder of the user's profile: one JSON file
 * per record, named by the SHA-256 of its location. The name never holds the
 * location itself, so a file system that folds case or normalises Unicode
 * (macOS, Windows) still keeps `/Workspaces/acme` and `/workspaces/acme`, or
 * the two spellings of `café`, apart, and a long path still fits in a name.
 *
 * Each file starts with its location, so a damaged record can still be named
 * in the error. A grant writes a temporary file and renames it over the
 * record, so a reader sees the old record or the new one, never half of one.
 * The folder must never be inside a workspace.
 */
export class FileTrustStore implements TrustStore {
  readonly #root: string;

  /** @param root - the folder for the trust records, such as `<profile>/trust`; created on the first grant */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async get(location: string): Promise<TrustRecord | null> {
    const file = this.#file(location);
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (isMissing(error)) return null;
      throw unreadable(location, file, error);
    }
    return parseRecord(location, file, text);
  }

  async grant(record: TrustRecord): Promise<void> {
    const { location, ...rest } = record;
    // The location goes first, so a damaged file can still be named.
    const text = `${JSON.stringify({ location, ...rest }, null, 2)}\n`;
    const file = this.#file(location);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await makePrivateFolder(this.#root);
    try {
      await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async revoke(location: string): Promise<void> {
    // Deletes the file without reading it, so a damaged record goes too.
    await rm(this.#file(location), { force: true });
  }

  async list(): Promise<TrustRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.#root);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const records: TrustRecord[] = [];
    for (const name of names.filter((entry) => recordFile.test(entry))) {
      const file = join(this.#root, name);
      let text: string | undefined;
      try {
        text = await readText(file);
      } catch (error) {
        throw unreadableFile(file, error);
      }
      // Revoked since the folder was read.
      if (text === undefined) continue;
      const location = locationIn(name, text);
      if (location === undefined) throw unreadableFile(file);
      records.push(parseRecord(location, file, text));
    }
    // By code unit, never by locale. Locations are unique, so there is no tie.
    return records.sort((left, right) => (left.location < right.location ? -1 : 1));
  }

  #file(location: string): string {
    return join(this.#root, `${hashLocation(location)}.json`);
  }
}

/**
 * The hash of a location's UTF-16 code units, little-endian. UTF-8 would turn
 * every lone surrogate into U+FFFD, so two locations Windows allows would
 * share one file.
 */
function hashLocation(location: string): string {
  return createHash("sha256").update(location, "utf16le").digest("hex");
}

/** A file's text, or `undefined` when it is gone. */
async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/**
 * The location a record file is for, read from the start of its text, or
 * `undefined` when it can't be read there. It is only believed when its hash
 * is the file's name, so a damaged file can't name another location.
 */
function locationIn(name: string, text: string): string | undefined {
  const match = leadingLocation.exec(text)?.[1];
  if (match === undefined) return undefined;
  let location: string;
  try {
    location = JSON.parse(match) as string;
  } catch {
    return undefined;
  }
  return `${hashLocation(location)}.json` === name ? location : undefined;
}

function parseRecord(location: string, file: string, text: string): TrustRecord {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch (error) {
    throw unreadable(location, file, error);
  }
  if (
    typeof record !== "object" ||
    record === null ||
    (record as { location?: unknown }).location !== location
  ) {
    throw unreadable(location, file, new Error("It isn't a trust record for this location."));
  }
  return record as TrustRecord;
}

function unreadable(location: string, file: string, cause: unknown): Error {
  return new Error(
    `The trust record for ${JSON.stringify(location)} can't be read (${JSON.stringify(file)}).`,
    { cause },
  );
}

/** For a record whose location can't be read either: names the file, which can be deleted by hand. */
function unreadableFile(file: string, cause?: unknown): Error {
  return new Error(
    `The trust record in ${JSON.stringify(file)} can't be read, nor which location it is for. Delete the file to remove it.`,
    { cause },
  );
}
