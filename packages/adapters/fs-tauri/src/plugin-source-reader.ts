import { checkWorkspacePath, type FolderReader } from "@halonicjs/ports";
import { CommandFolderReader } from "./command-folder-reader.ts";
import { pluginInstallCommands } from "./plugin-install-commands.ts";
import { pluginInstallFailure } from "./plugin-install-failure.ts";
import type { TauriShell } from "./shell.ts";

/**
 * Read access to the folder a plugin is added from in the Studio desktop app
 * (port `FolderReader`): a folder the person picked with Choose folder, or
 * one commit of a git repository the shell exported. The page names no path,
 * only the `location` an earlier answer gave; the shell refuses any other
 * (`source_not_picked`), follows no link, opens no special file and leaves
 * out the `.git` folder. It reads the same way the plugins folder's reader
 * does, so core's `PluginService.add` checks and hashes a source exactly as
 * it reads an added plugin.
 *
 * @example
 * const location = await installSource.pick();
 * const plugin = await service.add(new TauriPluginSourceReader(shell, location), options);
 */
export class TauriPluginSourceReader extends CommandFolderReader implements FolderReader {
  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param source - the location `pick` or `exportGit` answered
   */
  constructor(shell: TauriShell, source: string) {
    super(
      shell,
      { ...pluginInstallCommands, location: "" },
      { args: { source }, location: source, failure: pluginInstallFailure },
    );
  }

  /**
   * The shell never gives out a source's real path, so this is the location
   * `pick` or `exportGit` answered, with `path` after it when there is an
   * entry there. Core's `PluginService.add` asks for it once a source is
   * read, as the port asks of every folder, and keeps nothing of it: the
   * trust record names the copy in the plugins folder (HAL-12448).
   */
  override async locationOf(path?: string): Promise<string | null> {
    if (path === undefined) return this.location;
    checkWorkspacePath(path);
    const slash = path.lastIndexOf("/");
    const listed = await this.entries(slash === -1 ? undefined : path.slice(0, slash), {
      recursive: false,
    });
    return listed.some((entry) => entry.path === path) ? `${this.location}/${path}` : null;
  }
}
