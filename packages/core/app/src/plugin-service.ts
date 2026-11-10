// The plugin service, as `app.plugin-service` asks: it finds every plugin in
// the profile's plugin folder, reads and checks each one and asks whether it
// is trusted (P2 plan sections 1 and 5). The CLI and the Studio call it; it
// reaches the folder and the trust records only through ports.

import type { Plugin } from "@halonicjs/format";
import type { Digest, FolderEntry, FolderReader } from "@halonicjs/ports";
import { type PluginProblem, readPluginFolder } from "./plugin-folder.ts";
import type { PluginTrustCheck, PluginTrustSubject } from "./plugin-trust.ts";

/** A plugin folder that can't be read or checked. It gives no tools and no UI. */
export interface BrokenPlugin {
  readonly status: "broken";
  /** The plugin folder's name, in the profile's plugin folder. */
  readonly folder: string;
  /** Every problem found, for Studio's row and the CLI. Never empty. */
  readonly problems: readonly PluginProblem[];
}

/** A plugin that was read and checked, with whether it is trusted. Only `trusted` has a grant. */
export type ReadPlugin = PluginTrustCheck & {
  /** The plugin folder's name, which is the plugin's id. */
  readonly folder: string;
  /** The plugin folder's resolved real path: the trust record's key. */
  readonly location: string;
  readonly plugin: Plugin;
};

/** One plugin folder, as {@link PluginService.load} found it. */
export type PluginEntry = BrokenPlugin | ReadPlugin;

/** What {@link PluginService} needs from the host. */
export interface PluginServiceOptions {
  /** The profile's plugin folder, which holds one folder per plugin, named by its id. */
  readonly plugins: FolderReader;
  /** Hashes every file of a plugin. */
  readonly digest: Digest;
  /** The `TrustService`: plugins share its records with workspaces. */
  readonly trust: { checkPlugin(subject: PluginTrustSubject): Promise<PluginTrustCheck> };
}

/**
 * Finds, checks and trusts the plugins in the profile's plugin folder.
 *
 * @example
 * const plugins = new PluginService({ plugins: folderReader, digest, trust });
 * for (const entry of await plugins.load()) {
 *   if (entry.status === "broken") showProblems(entry.folder, entry.problems);
 * }
 */
export class PluginService {
  readonly #options: PluginServiceOptions;

  constructor(options: PluginServiceOptions) {
    this.#options = options;
  }

  /**
   * Every plugin folder, sorted by name, each read, checked and with its
   * trust status. One plugin that can't be read, checked or hashed is
   * `broken` and never stops the others. A file at the top of the plugin
   * folder isn't a plugin, so it isn't listed.
   *
   * @throws only when the plugin folder itself can't be listed
   */
  async load(): Promise<PluginEntry[]> {
    const top = await this.#options.plugins.entries(undefined, { recursive: false });
    const entries: PluginEntry[] = [];
    for (const entry of top) {
      if (entry.kind === "file") continue;
      entries.push(await this.#loadOne(entry));
    }
    return entries;
  }

  async #loadOne(entry: FolderEntry): Promise<PluginEntry> {
    const folder = entry.path;
    if (entry.kind !== "folder") return broken(folder, [notAFolderProblem(entry)]);
    try {
      const read = await readPluginFolder(this.#options.plugins, this.#options.digest, folder);
      if (!read.ok) return broken(folder, read.error);
      const { location, plugin } = read.value;
      const check = await this.#options.trust.checkPlugin(read.value);
      return { ...check, folder, location, plugin };
    } catch (error) {
      return broken(folder, [readFailedProblem(error)]);
    }
  }
}

function broken(folder: string, problems: readonly PluginProblem[]): BrokenPlugin {
  return { status: "broken", folder, problems };
}

/** A link or special file where a plugin folder should be, with the codes `readPluginFolder` uses inside one. */
function notAFolderProblem(entry: FolderEntry): PluginProblem {
  if (entry.kind === "link") {
    return {
      code: "link",
      file: "",
      path: [],
      message: `${entry.path} is a link, not a folder. Each plugin is a folder of its own, so a link can't point Halonic at files it didn't check.`,
    };
  }
  return {
    code: "special-file",
    file: "",
    path: [],
    message: `${entry.path} is a special file, such as a pipe or a socket. Each plugin is a folder of its own.`,
  };
}

/** What the reader, the digest or the trust check threw, for this one plugin. */
function readFailedProblem(error: unknown): PluginProblem {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    code: "read-failed",
    file: "",
    path: [],
    message: `Halonic couldn't read the plugin: ${reason}. Load it again; if it keeps failing, remove the plugin and install it again.`,
  };
}
