import { createHash, randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  ConnectionKey,
  ConnectionSettingsRecord,
  ConnectionSettingsStore,
} from "@halonicjs/ports";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";

/**
 * Each connector's "allow sending" setting as a file in one folder of the
 * user's profile: one JSON file per connector, named by the SHA-256 of its
 * key. Like the trust records and the "this computer" choices, the name never
 * holds the location or the connector id, so a file system that folds case
 * or normalises Unicode (macOS, Windows) still keeps two connectors apart,
 * and a long path still fits in a name.
 *
 * A save writes a temporary file and renames it over the settings, so a
 * reader sees the old settings or the new ones, never half of them. The
 * folder must never be inside a workspace: an agent that edits the
 * workspace must not be able to switch sending on. For the same reason
 * settings that are a link, such as one to a file in a workspace, can't be
 * read, and neither can settings copied from another connector, so one
 * connector can't borrow another's "allow sending". Only the files are
 * checked, not the folder: a folder that is itself a link is followed,
 * which is safe only because the folder lives in the profile.
 */
export class FileConnectionSettingsStore implements ConnectionSettingsStore {
  readonly #root: string;

  /** @param root - the folder for the settings, such as `<profile>/connections`; created on the first save */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async get(key: ConnectionKey): Promise<ConnectionSettingsRecord | null> {
    const file = this.#file(key);
    let text: string;
    try {
      text = await readUnlinkedFile(file);
    } catch (error) {
      if (isMissing(error)) return null;
      throw unreadable(key, file, error);
    }
    return parseSettings(key, file, text);
  }

  async save(settings: ConnectionSettingsRecord): Promise<void> {
    const { location, connector, allowSending, changedAt } = settings;
    // The key goes first, so a person who opens the file sees whose it is.
    // Only the fields of the settings are written, so `get` can read them back.
    const record = { location, connector, allowSending, changedAt };
    const text = `${JSON.stringify(record, null, 2)}\n`;
    const file = this.#file(settings);
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

  async remove(key: ConnectionKey): Promise<void> {
    // Deletes the file without reading it, so damaged settings go too.
    await rm(this.#file(key), { force: true });
  }

  #file(key: ConnectionKey): string {
    return join(this.#root, `${hashKey(key)}.json`);
  }
}

/**
 * The hash of a key: the JSON of `[location, connector]` as UTF-16 code
 * units, little-endian. JSON keeps a location ending in `/` from running
 * into the connector id, and UTF-16 keeps lone surrogates apart, as for
 * trust records.
 */
function hashKey(key: ConnectionKey): string {
  return createHash("sha256")
    .update(JSON.stringify([key.location, key.connector]), "utf16le")
    .digest("hex");
}

/** Every field of a {@link ConnectionSettingsRecord}, and no other. */
const settingsFields = ["location", "connector", "allowSending", "changedAt"] as const;

/**
 * Reads settings, and refuses any that aren't exactly settings for this
 * key: a file copied over another connector's would let that connector
 * borrow "allow sending", and a hand edit could add fields a later version
 * reads.
 */
function parseSettings(key: ConnectionKey, file: string, text: string): ConnectionSettingsRecord {
  let settings: unknown;
  try {
    settings = JSON.parse(text);
  } catch {
    // No `cause`: the parser's message can quote the text it read.
    throw unreadable(key, file);
  }
  if (!isSettingsFor(key, settings)) {
    throw unreadable(key, file, new Error("They aren't valid settings for this connector."));
  }
  return settings;
}

/** Whether `value` holds exactly the fields of settings for `key`, each of the right type. */
function isSettingsFor(key: ConnectionKey, value: unknown): value is ConnectionSettingsRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as { readonly [field in (typeof settingsFields)[number]]?: unknown };
  return (
    Object.keys(record).length === settingsFields.length &&
    settingsFields.every((field) => Object.hasOwn(record, field)) &&
    record.location === key.location &&
    record.connector === key.connector &&
    typeof record.allowSending === "boolean" &&
    typeof record.changedAt === "string"
  );
}

function unreadable(key: ConnectionKey, file: string, cause?: unknown): Error {
  return new Error(
    `The settings of the connector ${JSON.stringify(key.connector)} in ${JSON.stringify(key.location)} can't be read (${JSON.stringify(file)}).`,
    cause === undefined ? undefined : { cause },
  );
}
