import type { FolderReader } from "@halonicjs/ports";
import { CommandFolderReader } from "./command-folder-reader.ts";
import { pluginFolderCommands } from "./plugin-folder-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * Read access to the profile's plugins folder in the Studio desktop app
 * (port `FolderReader`), over the shell's `plugin_folder_*` commands. The
 * page names no folder: the shell reads the plugins folder of the CLI's
 * profile, never follows a link and never opens a special file. Paths are
 * checked here first, as the port says, and the shell checks them again.
 * It is the workspace reader with other commands, so both answer and refuse
 * the same way.
 *
 * @example
 * const reader = new TauriPluginFolderReader(shell);
 * const manifest = await reader.read("acme-weather/plugin.yaml");
 */
export class TauriPluginFolderReader extends CommandFolderReader implements FolderReader {
  /** @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__` */
  constructor(shell: TauriShell) {
    // The shell owns the real path of the plugins folder.
    super(shell, pluginFolderCommands, { args: {}, location: "plugins" });
  }
}
