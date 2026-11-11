// A profile's plugins folder in memory that plugins can be placed in and
// removed from, for the plugin service's tests. Core can't use the memory
// adapter, so this is the smallest `PluginFolderWriter` over a
// `TestFolderReader`, with the port's checks and its `taken` rule.

import {
  checkPluginFiles,
  checkPluginId,
  type PlacePluginOptions,
  type PluginFolderWriter,
  type PluginPlacement,
  segmentAsOpened,
} from "@halonicjs/ports";
import { TestFolderReader } from "./test-folder-reader.ts";

/** Places plugins into `reader`, the plugins folder the service reads. */
export class TestPluginFolder implements PluginFolderWriter {
  readonly reader: TestFolderReader;
  /** Runs before a plugin is placed, so a test can throw as a full disk would. */
  beforePlace: (id: string) => void = () => {};

  constructor(reader = new TestFolderReader()) {
    this.reader = reader;
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
    this.beforePlace(id);
    const top = await this.reader.entries(undefined, { recursive: false });
    const existing = top.find((entry) => segmentAsOpened(entry.path) === segmentAsOpened(id));
    if (existing !== undefined) {
      const replaceable = options.replace && existing.path === id && existing.kind === "folder";
      if (!replaceable) return "taken";
      this.reader.remove(id);
    }
    const placed = [...files].map(([path, bytes]) => [`${id}/${path}`, bytes.slice()] as const);
    this.reader.putFiles(Object.fromEntries(placed));
    return "placed";
  }

  async remove(id: string): Promise<void> {
    checkPluginId(id);
    this.reader.remove(id);
  }
}
