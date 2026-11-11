import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, watch as watchFolder } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  changeSavedHostSettings,
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  readSavedHostSettings,
} from "@halonicjs/ports";
import { writeFlushedFile } from "./flushed-write.ts";
import type { FolderEvents } from "./folder-watch.ts";
import { isMissing } from "./links.ts";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";
import { renameOver } from "./rename-over.ts";

/** The name of the one file that holds the settings, in the store's folder. */
const settingsFile = "host.json";

/** Where a save over a file that can't be parsed keeps it first. */
const brokenFile = "host.json.broken";

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
 * after, never half. Saves through one store run one at a time; between
 * processes the last save wins. A file that isn't JSON, or doesn't have that
 * shape, reads as none saved, and the first save over it renames it to
 * `host.json.broken` first. A save keeps keys and fields it doesn't know as
 * they are (`changeSavedHostSettings`). A file that is a link, a hard link
 * or not a plain file can't be read, so `read` throws; a save replaces it.
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
    const text = await this.#readText();
    return (text === undefined ? undefined : readSavedHostSettings(text)) ?? {};
  }

  set(key: string, value: HostSettingValue): Promise<void> {
    return this.#enqueue(key, value);
  }

  remove(key: string): Promise<void> {
    return this.#enqueue(key, undefined);
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

  #enqueue(key: string, value: HostSettingValue | undefined): Promise<void> {
    const save = this.#saving.then(() => this.#save(key, value));
    this.#saving = save.catch(() => undefined);
    return save;
  }

  async #save(key: string, value: HostSettingValue | undefined): Promise<void> {
    const old = await this.#textForSave();
    const change = changeSavedHostSettings(old, key, value);
    await makePrivateFolder(this.#root);
    if (change.broken) await renameOver(this.#file, join(this.#root, brokenFile));
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    try {
      await writeFlushedFile(temporary, change.text, { mode: 0o600 });
      await renameOver(temporary, this.#file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  /** The file's text; `undefined` when there is no file. */
  async #readText(): Promise<string | undefined> {
    try {
      return await readUnlinkedFile(this.#file);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw new Error(`The settings in ${JSON.stringify(this.#file)} can't be read.`, {
        cause: error,
      });
    }
  }

  /** The text to save over: none for a link or other entry the rename will replace. */
  async #textForSave(): Promise<string | undefined> {
    try {
      return await this.#readText();
    } catch (error) {
      if (error instanceof Error && error.cause instanceof RangeError) return undefined;
      throw error;
    }
  }
}
