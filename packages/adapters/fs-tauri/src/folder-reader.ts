import type { FolderReader } from "@halonicjs/ports";
import { CommandFolderReader } from "./command-folder-reader.ts";
import { folderCommands } from "./folder-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * Read access to every byte of a folder the person opened in the Studio
 * desktop app, with nothing left out (port `FolderReader`): every call goes
 * to one of the shell's `folder_*` commands, which list entries with their
 * kind, give a file's exact bytes and give an entry's real location. Links
 * are listed and never followed, and special files never opened.
 *
 * The page names the workspace, never a path outside it. Paths are checked
 * here as the port says, before the shell is called, and the shell checks
 * them again, since the page isn't trusted; it also refuses any path through
 * a link, which only it can see, and the profile.
 *
 * @example
 * const reader = new TauriFolderReader(shell, workspace);
 * const bytes = await reader.read("acme-notes/plugin.yaml");
 */
export class TauriFolderReader extends CommandFolderReader implements FolderReader {
  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param workspace - the folder, as the person opened it in the shell
   */
  constructor(shell: TauriShell, workspace: string) {
    super(shell, folderCommands, { args: { workspace }, location: workspace });
  }
}
