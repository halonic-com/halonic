import { checkWorkspacePath } from "./definition-store.ts";

/** Version of the {@link PluginFolderWriter} port. A breaking change bumps it and comes with an ADR. */
export const pluginFolderWriterVersion = 1;

/**
 * Refuses an id that isn't one folder name, the only kind of id a
 * {@link PluginFolderWriter} method takes: empty, `.`, `..`, or one with a
 * `/`, `\` or NUL could reach a folder inside a plugin or outside the
 * plugins folder.
 *
 * @throws RangeError naming the id
 */
export function checkPluginId(id: string): void {
  if (id === "" || id === "." || id === ".." || /[/\\]/u.test(id) || id.includes("\u0000")) {
    throw new RangeError(`${JSON.stringify(id)} isn't a plugin id: give one folder name.`);
  }
}

/**
 * Refuses what {@link PluginFolderWriter.place} must never write: an unsafe
 * id, a file path that `checkWorkspacePath` refuses, or a path that is a file
 * and also a folder above another file. Adapters call it before they touch
 * storage.
 *
 * @throws RangeError naming the id or the path
 */
export function checkPluginFiles(id: string, files: ReadonlyMap<string, Uint8Array>): void {
  checkPluginId(id);
  for (const path of files.keys()) checkWorkspacePath(path);
  for (const path of files.keys()) {
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      const folder = segments.slice(0, depth).join("/");
      if (files.has(folder)) {
        throw new RangeError(
          `${JSON.stringify(folder)} is a file and also a folder above ${JSON.stringify(path)}.`,
        );
      }
    }
  }
}

/** Options for {@link PluginFolderWriter.place}. */
export interface PlacePluginOptions {
  /**
   * Put the new plugin folder in place of the one already there, for a new
   * commit of the same plugin. Only a real folder with exactly this id is
   * replaced: one whose name differs only in case, or a link, stays and
   * gives `"taken"`.
   */
  readonly replace: boolean;
}

/**
 * What {@link PluginFolderWriter.place} did: `placed` the folder, or found
 * the id `taken` and wrote nothing into the plugins folder.
 */
export type PluginPlacement = "placed" | "taken";

/**
 * Write access to the profile's plugins folder, which holds one folder per
 * plugin, named by its id (requirement `ports.plugin-folder-writer`).
 * Installing a plugin places it here and removing it takes it away; a
 * `FolderReader` over the same folder reads it.
 *
 * **The plugins folder lives in the person's profile, never in a
 * workspace**, so a workspace can't install a plugin.
 *
 * **Whole or not at all.** `place` writes the files into a new folder
 * beside the plugins folder, never inside it, and then moves that folder
 * into place, so a reader never lists a plugin that is half written. When
 * it fails, nothing new is left in the plugins folder.
 *
 * **Every method refuses an unsafe id or path** with a `RangeError` before
 * it touches storage. An id is one folder name: not empty, `.` or `..`, and
 * with no `/`, `\` or NUL. A file's path is relative and "/" separated, by
 * the rule of `checkWorkspacePath`, and no file's path may also be a folder
 * above another file.
 *
 * Nothing is ever written or deleted through a link: `place` never
 * replaces one, and `remove` takes away the link itself, never what it
 * points to.
 *
 * @example
 * const files = new Map([["plugin.yaml", manifestBytes], ["backend/index.js", codeBytes]]);
 * if ((await writer.place("weather", files, { replace: false })) === "taken") {
 *   showAlreadyAdded("weather");
 * }
 */
export interface PluginFolderWriter {
  /** Human-readable location of the plugins folder, such as "~/.halonic/plugins" or "memory:plugins". */
  readonly location: string;
  /**
   * Writes `files` as the plugin folder `id`, whole or not at all. Without
   * `replace`, gives `"taken"` and writes nothing when any entry at the top
   * of the plugins folder already has this name, in any case, so two
   * plugins never differ only in case.
   *
   * @param id - the plugin's id, which names its folder
   * @param files - every file's bytes, by path from the plugin folder
   * @throws a `RangeError` for an unsafe id or path, before anything is written
   */
  place(
    id: string,
    files: ReadonlyMap<string, Uint8Array>,
    options: PlacePluginOptions,
  ): Promise<PluginPlacement>;
  /**
   * Removes the entry `id` at the top of the plugins folder: a folder with
   * everything in it, or a link itself and never what it points to.
   * Nothing happens when there is none.
   *
   * @throws a `RangeError` for an unsafe id, before anything is removed
   */
  remove(id: string): Promise<void>;
}
