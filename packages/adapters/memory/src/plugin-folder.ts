import {
  checkPluginFiles,
  checkPluginId,
  type FolderEntry,
  type PlacePluginOptions,
  type PluginFolderWriter,
  type PluginPlacement,
  segmentAsOpened,
} from "@halonicjs/ports";
import { MemoryFolderReader } from "./folder-reader.ts";

/**
 * A plugins folder in memory, for tests and the browser demo. It places and
 * removes plugins as a `PluginFolderWriter`, and its `reader` reads the same
 * folder, so a test can also build the folder with the reader's `put…`
 * methods. Every check runs before anything changes, so a refused `place`
 * leaves the folder as it was.
 */
export class MemoryPluginFolder implements PluginFolderWriter {
  /** Reads the plugins folder, as the plugin service does. */
  readonly reader: MemoryFolderReader;

  constructor(location = "memory:plugins") {
    this.reader = new MemoryFolderReader(location);
  }

  get location(): string {
    return this.reader.location;
  }

  async place(
    id: string,
    files: ReadonlyMap<string, Uint8Array>,
    options: PlacePluginOptions,
  ): Promise<PluginPlacement> {
    checkPluginFiles(id, files);
    const existing = await this.#topEntry(id);
    if (existing !== undefined) {
      const replaceable = options.replace && existing.path === id && existing.kind === "folder";
      if (!replaceable) return "taken";
      this.reader.remove(id);
    }
    this.reader.putFolder(id);
    for (const [path, bytes] of files) this.reader.putFile(`${id}/${path}`, bytes);
    return "placed";
  }

  async remove(id: string): Promise<void> {
    checkPluginId(id);
    // A link is kept without anything under it, so what it points to stays.
    this.reader.remove(id);
  }

  /** The entry at the top whose name is `id` in any case, if there is one. */
  async #topEntry(id: string): Promise<FolderEntry | undefined> {
    const top = await this.reader.entries(undefined, { recursive: false });
    const wanted = segmentAsOpened(id);
    return top.find((entry) => segmentAsOpened(entry.path) === wanted);
  }
}
