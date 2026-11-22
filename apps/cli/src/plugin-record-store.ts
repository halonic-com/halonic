// The profile's plugin records, read so that a record file the person may
// not open, or one that holds something other than records, names the file
// and the fix instead of the store's own error, which the command line can
// only report as a bug (HAL-15893, C646). The same refusals the plugins
// folder (HAL-15785) and the secrets file (HAL-15511) give.

import { access, constants } from "node:fs/promises";
import {
  type PluginRecordProblem,
  type PluginsFolderAccess,
  pluginInstallsCollection,
  pluginSettingsCollection,
} from "@halonicjs/app";
import { BrokenRecordLogError, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { plainText } from "./messages/phrase.ts";
import { pluginMessages } from "./messages/plugin.ts";
import { shellWord } from "./output/shell-word.ts";
import { accessTo, isPermissionDenied } from "./plugins-folder-reader.ts";

/**
 * A plugin record file, or the folder that holds them, that the person
 * running Halonic may not open, such as one left with mode `000`: `denied`,
 * so exit 7.
 */
export class UnreadablePluginRecordError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "plugin-record-unreadable";
  /** Whether the file system refused one record file or the folder that holds them. */
  readonly place: "file" | "folder";
  /** The file or folder the file system refused. */
  readonly path: string;
  /** Who can give the person access again, for the fix. */
  readonly access: PluginsFolderAccess;

  /** @param cause - the file system's error, kept for `--debug` */
  constructor(place: "file" | "folder", path: string, access: PluginsFolderAccess, cause: unknown) {
    super("denied", plainText(pluginMessages.recordUnreadable(place, path).phrase), {
      fix: plainText(pluginMessages.recordUnreadableFix(place, access, shellWord(path)).phrase),
      cause,
    });
    this.place = place;
    this.path = path;
    this.access = access;
  }
}

/**
 * A plugin record file that holds something other than whole records, such
 * as a line edited by hand: `unavailable`, as a damaged secrets file is.
 * Every plugin's records of one kind are in it, so the fix says what
 * deleting it forgets.
 */
export class DamagedPluginRecordError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "plugin-record-damaged";
  /** The damaged file. */
  readonly path: string;
  /** The damaged line, counted from 1, or `undefined` when the whole file is damaged. */
  readonly line: number | undefined;
  /** Why it is damaged, in the store's words, such as "it is not JSON." */
  readonly why: string;
  /** What deleting the file forgets, for the fix. */
  readonly holds: PluginRecordHolds;

  /**
   * @param broken - the store's error, kept for `--debug`
   * @param collection - the collection the file holds
   */
  constructor(broken: BrokenRecordLogError, collection: string | undefined) {
    const { file, why, line } = broken;
    const holds = holdsOf(collection);
    super("unavailable", plainText(pluginMessages.recordDamaged(file, why, line).phrase), {
      fix: plainText(pluginMessages.recordDamagedFix(holds, line).phrase),
      cause: broken,
    });
    this.path = file;
    this.line = line;
    this.why = why;
    this.holds = holds;
  }
}

/** What a plugin record file holds: where each plugin was added from, their settings, or other records. */
type PluginRecordHolds = Extract<PluginRecordProblem, { problem: "records-damaged" }>["holds"];

/** What a plugin collection holds, for the fix's "Deleting the file forgets …". */
function holdsOf(collection: string | undefined): PluginRecordHolds {
  if (collection === pluginInstallsCollection) return "sources";
  if (collection === pluginSettingsCollection) return "settings";
  return "other";
}

/**
 * Keeps the plugin records through `inner`, and turns a record file the
 * file system refuses into {@link UnreadablePluginRecordError} and a
 * damaged one into {@link DamagedPluginRecordError}. Every other error
 * stays as it is.
 *
 * @example
 * const records = new PluginRecordStore(new FileRecordStore(folder), folder);
 * await records.changes("plugin-installs"); // throws DamagedPluginRecordError for a line that isn't JSON
 */
export class PluginRecordStore implements RecordStore {
  readonly #inner: RecordStore;
  readonly #folder: string;

  /** @param folder - the plugin records folder `inner` keeps its files in */
  constructor(inner: RecordStore, folder: string) {
    this.#inner = inner;
    this.#folder = folder;
  }

  async append(changes: readonly RecordChange[]): Promise<void> {
    await this.#explained(changes[0]?.collection, () => this.#inner.append(changes));
  }

  async changes(collection: string): Promise<RecordChange[]> {
    return await this.#explained(collection, () => this.#inner.changes(collection));
  }

  async compact(collection: string): Promise<void> {
    await this.#explained(collection, () => this.#inner.compact(collection));
  }

  async #explained<T>(collection: string | undefined, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw await this.#explain(error, collection);
    }
  }

  async #explain(error: unknown, collection: string | undefined): Promise<unknown> {
    if (error instanceof BrokenRecordLogError)
      return new DamagedPluginRecordError(error, collection);
    if (!isPermissionDenied(error)) return error;
    // A folder the person may not open refuses every file in it, so the folder is what to fix.
    const file = (error as { path?: unknown }).path;
    if ((await folderIsDenied(this.#folder)) || typeof file !== "string") {
      return new UnreadablePluginRecordError(
        "folder",
        this.#folder,
        await accessTo(this.#folder),
        error,
      );
    }
    return new UnreadablePluginRecordError("file", file, await accessTo(file), error);
  }
}

/** Whether the file system refuses the person reading, writing or entering `folder`. */
async function folderIsDenied(folder: string): Promise<boolean> {
  return await access(folder, constants.R_OK | constants.W_OK | constants.X_OK).then(
    () => false,
    (error: unknown) => isPermissionDenied(error),
  );
}
