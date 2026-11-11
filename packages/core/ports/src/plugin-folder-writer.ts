import { checkWorkspacePath, segmentAsOpened } from "./definition-store.ts";

/** Version of the {@link PluginFolderWriter} port. A breaking change bumps it and comes with an ADR. */
export const pluginFolderWriterVersion = 1;

/** Windows device names, which open the device whatever the extension: `con`, `nul.txt`, `com1`. */
const windowsDevice = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])$/u;

/**
 * Why Windows or macOS would open `name` as another entry, or can't name it,
 * if so: a `:` (an NTFS stream), a trailing dot or space (dropped), a `~`
 * followed by a digit (an 8.3 short name), a device name, a control
 * character, or a character Windows doesn't allow in a name. The `:` and
 * `~digit` rule is the one private workspace paths use.
 */
function whyNotPortable(name: string): string | undefined {
  if (name.includes(":")) return "no `:`, which Windows opens as a stream";
  if (/[. ]$/u.test(name)) return "no trailing dot or space, which Windows drops";
  if (/~\d/u.test(name)) return "no `~` followed by a digit, which Windows opens as a short name";
  if ([...name].some(isControlCharacter)) return "no control character";
  if (/[<>"|?*]/u.test(name)) return 'no `<`, `>`, `"`, `|`, `?` or `*`, which Windows refuses';
  const base = segmentAsOpened(name).split(".")[0]?.trimEnd() ?? "";
  if (windowsDevice.test(base)) return "not a Windows device name such as `con` or `nul`";
  return undefined;
}

/** NUL to U+001F and DEL. */
function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
}

/**
 * Refuses an id that isn't one folder name every system opens the same way,
 * the only kind of id a {@link PluginFolderWriter} method takes: empty, `.`,
 * `..`, or one with a `/` or `\` could reach a folder inside a plugin or
 * outside the plugins folder, and one Windows or macOS opens as another
 * entry (see the port) could get round the `taken` check. Upper case is
 * fine.
 *
 * @throws RangeError naming the id
 */
export function checkPluginId(id: string): void {
  if (id === "" || id === "." || id === ".." || /[/\\]/u.test(id)) {
    throw new RangeError(`${JSON.stringify(id)} isn't a plugin id: give one folder name.`);
  }
  const why = whyNotPortable(id);
  if (why !== undefined) {
    throw new RangeError(`${JSON.stringify(id)} isn't a plugin id: ${why}.`);
  }
}

/**
 * Refuses what {@link PluginFolderWriter.place} must never write: an unsafe
 * id; a file path that `checkWorkspacePath` refuses or with a segment the
 * id rule refuses; two paths that are the same file on a disk that ignores
 * case; or a path that is a file and also a folder above another file, in
 * any case. Paths are compared segment by segment with `segmentAsOpened`,
 * so what lands on any disk is exactly the set of files given. Adapters
 * call it before they touch storage.
 *
 * @throws RangeError naming the id or the path
 */
export function checkPluginFiles(id: string, files: ReadonlyMap<string, Uint8Array>): void {
  checkPluginId(id);
  /** Each file's path as a disk that ignores case opens it, to the path given. */
  const opened = new Map<string, string>();
  for (const path of files.keys()) {
    checkWorkspacePath(path);
    for (const segment of path.split("/")) {
      const why = whyNotPortable(segment);
      if (why !== undefined) {
        throw new RangeError(`Unsafe plugin file path ${JSON.stringify(path)}: ${why}.`);
      }
    }
    const key = pathAsOpened(path);
    const same = opened.get(key);
    if (same !== undefined) {
      throw new RangeError(
        `${JSON.stringify(same)} and ${JSON.stringify(path)} are the same file on a disk that ignores case.`,
      );
    }
    opened.set(key, path);
  }
  for (const path of files.keys()) {
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      const file = opened.get(pathAsOpened(segments.slice(0, depth).join("/")));
      if (file !== undefined) {
        throw new RangeError(
          `${JSON.stringify(file)} is a file and also a folder above ${JSON.stringify(path)}.`,
        );
      }
    }
  }
}

function pathAsOpened(path: string): string {
  return path.split("/").map(segmentAsOpened).join("/");
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
 * with no `/` or `\`. Neither an id nor a segment of a file's path may be a
 * name Windows or macOS opens as another entry or can't name: no `:`, no
 * trailing dot or space, no `~` followed by a digit, no device name such
 * as `con`, and no control character. A file's path is relative and "/"
 * separated, by the rule of `checkWorkspacePath`; no two paths may be the
 * same file on a disk that ignores case, and no file's path may also be a
 * folder above another file.
 *
 * **The same name in any case** means the same after `segmentAsOpened`,
 * in every adapter, whatever the disk under it does.
 *
 * `place` writes whatever files it is given, even none: refusing a plugin
 * without a `plugin.yaml` is the plugin service's job.
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
   * Removes the entry named exactly `id` at the top of the plugins folder:
   * a folder with everything in it, or a link itself and never what it
   * points to. Nothing happens when there is none, even when an entry has
   * the id in another case: `remove("weather")` leaves `Weather`.
   *
   * @throws a `RangeError` for an unsafe id, before anything is removed
   */
  remove(id: string): Promise<void>;
}
