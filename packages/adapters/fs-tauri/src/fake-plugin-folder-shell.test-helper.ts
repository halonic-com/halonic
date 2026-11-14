import { FakeFolderShell, type FolderTree } from "./fake-folder-shell.test-helper.ts";
import type { ShellCall } from "./fake-shell.test-helper.ts";
import type { TauriShell } from "./shell.ts";

const pluginsFolder = "/profile/plugins";

/** The shell's refusal for a plugin name that isn't one plain folder name. */
function unsafePlugin(): unknown {
  return { kind: "unsafe_path", message: "the plugin name is unsafe" };
}

/**
 * A shell that answers the `plugin_folder_*` commands the way the Rust shell
 * does: the reading commands are the `folder_*` ones over the profile's
 * plugins folder, which no call names, and `plugin_folder_remove` deletes
 * one plugin's folder, or the link itself, and succeeds when there is none.
 * Every call is kept in `calls`; `plugins` lists what is installed.
 */
export class FakePluginFolderShell implements TauriShell {
  readonly calls: ShellCall[] = [];
  readonly #folder: FakeFolderShell;
  readonly #installed: Set<string>;
  readonly #granted: boolean;

  /**
   * @param options.tree - what the plugins folder holds: files, folders, links and special files
   * @param options.granted - whether the page has the capability for the commands
   */
  constructor(options: { tree: FolderTree; granted?: boolean }) {
    this.#folder = new FakeFolderShell({ opened: pluginsFolder, tree: options.tree });
    this.#installed = new Set(
      Object.keys(options.tree.files ?? {}).map((path) => path.replace(/\/.*$/u, "")),
    );
    this.#granted = options.granted ?? true;
  }

  /** The plugin folders that are there. */
  get plugins(): string[] {
    return [...this.#installed].sort();
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args: structuredClone(args) });
    if (!this.#granted) {
      throw `Command ${command} not allowed by ACL`;
    }
    if (command === "plugin_folder_remove") {
      return this.#remove(args["plugin"]);
    }
    const folderCommand = command.replace(/^plugin_/u, "");
    if (!["folder_entries", "folder_read", "folder_location"].includes(folderCommand)) {
      throw `Command ${command} not found`;
    }
    return this.#folder.invoke(folderCommand, { workspace: pluginsFolder, ...args });
  }

  #remove(plugin: unknown): null {
    if (typeof plugin !== "string" || plugin === "" || /[/\\]|^\.\.?$/u.test(plugin)) {
      throw unsafePlugin();
    }
    this.#installed.delete(plugin);
    return null;
  }
}
