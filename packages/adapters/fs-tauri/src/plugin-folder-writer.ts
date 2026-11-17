import {
  checkPluginFiles,
  checkPluginId,
  type PlacePluginOptions,
  type PluginFolderWriter,
  type PluginPlacement,
} from "@halonicjs/ports";
import { encodeBase64url } from "@halonicjs/std";
import { folderFailure } from "./command-folder-reader.ts";
import { pluginFolderCommands } from "./plugin-folder-commands.ts";
import { pluginInstallCommands } from "./plugin-install-commands.ts";
import { pluginInstallFailure } from "./plugin-install-failure.ts";
import type { TauriShell } from "./shell.ts";

/**
 * The plugins folder's writer in the Studio desktop app (port
 * `PluginFolderWriter`). It places a plugin through the shell's
 * `plugin_folder_place`, which writes the files into a new folder beside the
 * plugins folder and renames it into place, so the plugin is whole or not
 * there, and never overwrites a name in use in any case (`taken`). The shell
 * runs nothing: the plugin lands not trusted. It removes a plugin through
 * `plugin_folder_remove`, which never follows a link. The page names a
 * plugin and its files, never a path (`fs-tauri.plugin-folder`).
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
    files: ReadonlyMap<string, Uint8Array>,
    options: PlacePluginOptions,
  ): Promise<PluginPlacement> {
    checkPluginFiles(id, files);
    try {
      const answer = await this.#shell.invoke(pluginInstallCommands.place, {
        plugin: id,
        files: [...files].map(([path, bytes]) => ({ path, bytes: encodeBase64url(bytes) })),
        replace: options.replace,
      });
      if (answer !== "placed" && answer !== "taken") throw noPlacement();
      return answer;
    } catch (reason) {
      throw pluginInstallFailure(reason);
    }
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

/** The shell's answer wasn't `placed` or `taken`: the adapter can't tell if the plugin is there. */
function noPlacement(): Error {
  return new Error("The shell gave no answer to the place call.");
}
