// The profile's plugins folder, read so that a folder the person may not
// list says so, with the fix, instead of the file system's own error, which
// the command line can only report as a bug (HAL-15785, C630 #1). The same
// refusal the secrets file gives since HAL-15511, for the folder that holds
// every plugin.

import { stat } from "node:fs/promises";
import type { PluginsFolderAccess } from "@halonicjs/app";
import type { FolderEntriesOptions, FolderEntry, FolderReader } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { plainText } from "./messages/phrase.ts";
import { pluginMessages } from "./messages/plugin.ts";
import { shellWord } from "./output/shell-word.ts";

/**
 * The plugins folder itself can't be listed by the person running Halonic,
 * such as one left with mode `000` or made by another user with `sudo`:
 * `denied`, so exit 7. Every plugin in it is off, so `doctor` names the
 * folder rather than a plugin.
 */
export class UnreadablePluginsFolderError extends KindedError {
  /** The detailed code on line 3 and in `--json`. */
  readonly code = "plugins-folder-unreadable";
  /** The plugins folder, as the profile names it. */
  readonly folder: string;
  readonly access: PluginsFolderAccess;

  /** @param cause - the file system's error, kept for `--debug` */
  constructor(folder: string, access: PluginsFolderAccess, cause: unknown) {
    super("denied", plainText(pluginMessages.folderUnreadable(folder).phrase), {
      fix: plainText(pluginMessages.folderUnreadableFix(access, shellWord(folder)).phrase),
      cause,
    });
    this.folder = folder;
    this.access = access;
  }
}

/**
 * Whether a file system error says the folder is there but this user may
 * not open it: `EACCES`, or `EPERM`, which Windows and some file systems
 * give for the same thing.
 */
export function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "EACCES" || code === "EPERM";
}

/**
 * Reads the plugins folder through `inner`, and refuses a listing of the
 * folder itself that the file system denies with
 * {@link UnreadablePluginsFolderError}. A plugin's own folder that can't be
 * read keeps its error, so the plugin service shows only that plugin as
 * broken and lists the others.
 *
 * @example
 * const plugins = new PluginsFolderReader(new FileSystemFolderReader(folder), folder);
 * await plugins.entries(); // throws UnreadablePluginsFolderError for a folder with mode 000
 */
export class PluginsFolderReader implements FolderReader {
  readonly #inner: FolderReader;
  readonly #folder: string;

  constructor(inner: FolderReader, folder: string) {
    this.#inner = inner;
    this.#folder = folder;
  }

  get location(): string {
    return this.#inner.location;
  }

  async entries(dir?: string, options?: FolderEntriesOptions): Promise<FolderEntry[]> {
    try {
      return await this.#inner.entries(dir, options);
    } catch (error) {
      if (dir !== undefined || !isPermissionDenied(error)) throw error;
      throw new UnreadablePluginsFolderError(this.#folder, await accessTo(this.#folder), error);
    }
  }

  read(path: string): Promise<Uint8Array | null> {
    return this.#inner.read(path);
  }

  locationOf(path?: string): Promise<string | null> {
    return this.#inner.locationOf(path);
  }
}

/**
 * Who can fix `folder`, or a file, from its owner and the user Halonic runs
 * as. One whose owner can't be read is taken as the person's own, since
 * `chmod` is then the first thing to try.
 */
export async function accessTo(folder: string): Promise<PluginsFolderAccess> {
  const userId = process.getuid?.();
  if (process.platform === "win32" || userId === undefined) return "windows";
  const ownerId = await stat(folder).then(
    (stats) => stats.uid,
    () => userId,
  );
  return ownerId === userId ? "yours" : "another-user";
}
