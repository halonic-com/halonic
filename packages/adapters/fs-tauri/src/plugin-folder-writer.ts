import {
  checkPluginId,
  type PlacePluginOptions,
  type PluginFolderWriter,
  type PluginPlacement,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { folderFailure } from "./command-folder-reader.ts";
import { pluginFolderCommands } from "./plugin-folder-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * The plugins folder's writer in the Studio desktop app (port
 * `PluginFolderWriter`). The desktop can remove a plugin, through the
 * shell's `plugin_folder_remove`, which never follows a link; it cannot add
 * one, so `place` always refuses: adding a plugin is a CLI action
 * (`halonic plugin add`), and no shell command writes files into the
 * plugins folder.
 */
export class TauriPluginFolderWriter implements PluginFolderWriter {
  /** Where the plugins folder is, for messages; the shell owns the real path. */
  readonly location = "plugins";
  readonly #shell: TauriShell;

  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    this.#shell = shell;
  }

  async place(
    id: string,
    _files: ReadonlyMap<string, Uint8Array>,
    _options: PlacePluginOptions,
  ): Promise<PluginPlacement> {
    checkPluginId(id);
    throw new KindedError(
      "denied",
      "Adding a plugin is a CLI action: run `halonic plugin add` in a terminal.",
    );
  }

  async remove(id: string): Promise<void> {
    checkPluginId(id);
    try {
      await this.#shell.invoke(pluginFolderCommands.remove, { plugin: id });
    } catch (reason) {
      throw folderFailure(reason);
    }
  }
}
