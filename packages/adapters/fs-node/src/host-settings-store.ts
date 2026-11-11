import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, watch as watchFolder } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  hostSettingsMaxBytes,
  isHostSettingKey,
} from "@halonicjs/ports";
import { writeFlushedFile } from "./flushed-write.ts";
import type { FolderEvents } from "./folder-watch.ts";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";
import { renameOver } from "./rename-over.ts";

/** The name of the one file that holds the settings, in the store's folder. */
const settingsFile = "host.json";

/** The file's format, written as its `version`. */
const formatVersion = 1;

/** `node:fs.watch` on the folder alone: the settings file sits in it, never deeper. */
const nodeSettingsEvents: FolderEvents = (root, noticed, failed) => {
  const watcher = watchFolder(root, (_event, name) => noticed(name ?? ""));
  watcher.on("error", failed);
  return () => watcher.close();
};

/** How a {@link FileHostSettingsStore} is told about changes; tests pass their own. */
export interface FileHostSettingsStoreOptions {
  readonly events?: FolderEvents;
}

/**
 * The settings kept where Halonic runs, as one JSON file, `host.json`, in a
 * folder of the user's profile: `settingsFolder(profile)`. The folder must
 * never be inside a workspace. The file holds `{ "version": 1, "values": {…} }`.
 *
 * A save reads the file, changes one key and writes a temporary file it
 * renames over the old one, so a reader sees the settings from before or
 * after, never half. Saves through one store run one at a time. A file that
 * isn't JSON, or doesn't have that shape, reads as none saved; a key no
 * setting can have is left out. A file that is a link, a hard link or not a
 * plain file can't be read, so `read` throws; a save replaces it.
 *
 * `watch` watches the folder (creating it, private), so it also hears the
 * CLI or another window save.
 */
export class FileHostSettingsStore implements HostSettingsStore {
  readonly #root: string;
  readonly #file: string;
  readonly #events: FolderEvents;
  #saving: Promise<void> = Promise.resolve();

  /** @param root - the settings folder, such as `<profile>/settings`; created on the first save or watch */
  constructor(root: string, options: FileHostSettingsStoreOptions = {}) {
    this.#root = resolve(root);
    this.#file = join(this.#root, settingsFile);
    this.#events = options.events ?? nodeSettingsEvents;
  }

  async read(): Promise<HostSettingValues> {
    let text: string;
    try {
      text = await readUnlinkedFile(this.#file);
    } catch (error) {
      if (isMissing(error)) return {};
      throw new Error(`The settings in ${JSON.stringify(this.#file)} can't be read.`, {
        cause: error,
      });
    }
    return parseSettings(text);
  }

  async set(key: string, value: HostSettingValue | undefined): Promise<void> {
    if (!isHostSettingKey(key)) {
      throw new RangeError(`${JSON.stringify(key)} can't name a setting.`);
    }
    if (value !== undefined && !holdsOnlyFiniteNumbers(value)) {
      throw new RangeError(`The value for ${key} has a number that isn't finite.`);
    }
    const save = this.#saving.then(() => this.#save(key, value));
    this.#saving = save.catch(() => undefined);
    return save;
  }

  watch(listener: () => void): () => void {
    mkdirSync(this.#root, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") chmodSync(this.#root, 0o700);
    // A failed watch is told as a change: the caller reads again and hears the error there.
    return this.#events(
      this.#root,
      (name) => {
        if (name === "" || name === settingsFile) listener();
      },
      () => listener(),
    );
  }

  async #save(key: string, value: HostSettingValue | undefined): Promise<void> {
    const values: Record<string, HostSettingValue> = { ...(await this.#readForSave()) };
    if (value === undefined) delete values[key];
    else values[key] = value;
    if (Buffer.byteLength(JSON.stringify(values)) > hostSettingsMaxBytes) {
      throw new RangeError(`The settings would be over ${hostSettingsMaxBytes} bytes with ${key}.`);
    }
    const text = `${JSON.stringify({ version: formatVersion, values }, null, 2)}\n`;
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    await makePrivateFolder(this.#root);
    try {
      await writeFlushedFile(temporary, text, { mode: 0o600 });
      await renameOver(temporary, this.#file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  /** The values to save on top of: none for a link or other entry the rename will replace. */
  async #readForSave(): Promise<HostSettingValues> {
    try {
      return await this.read();
    } catch (error) {
      if (error instanceof Error && error.cause instanceof RangeError) return {};
      throw error;
    }
  }
}

/** The values in the file's text; none when it isn't the file's shape. */
function parseSettings(text: string): HostSettingValues {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  const values = isObject(parsed) ? parsed["values"] : undefined;
  if (!isObject(values)) return {};
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => isHostSettingKey(key)),
  ) as HostSettingValues;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function holdsOnlyFiniteNumbers(value: HostSettingValue): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || value === null) return true;
  return Object.values(value).every(holdsOnlyFiniteNumbers);
}
