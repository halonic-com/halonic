// The plugin service, as `app.plugin-service` asks: it finds every plugin in
// the profile's plugin folder, reads and checks each one and asks whether it
// is trusted (P2 plan sections 1 and 5). It saves and forgets a person's
// trust, keeps each plugin's setting values, which only removing the plugin
// deletes, and gives the tools and UI of the trusted ones. The CLI and the
// Studio call it; it reaches the folder, the trust records and the setting
// values only through ports.

import type { Plugin } from "@halonicjs/format";
import type {
  Clock,
  Digest,
  FolderEntry,
  FolderReader,
  RecordStore,
  TrustGrant,
} from "@halonicjs/ports";
import { err, type Result } from "@halonicjs/std";
import {
  type PluginToolSet,
  type PluginUiContribution,
  trustedPluginTools,
  trustedPluginUi,
} from "./plugin-contributions.ts";
import { type PluginProblem, readPluginFolder } from "./plugin-folder.ts";
import { pluginSecretNames } from "./plugin-secret-names.ts";
import {
  type PluginSettingProblem,
  PluginSettings,
  type PluginSettingValues,
} from "./plugin-settings.ts";
import type { PluginTrustCheck } from "./plugin-trust.ts";
import type { PersonTrustOrigin, TrustRefusal } from "./trust-record.ts";
import type { TrustService } from "./trust-service.ts";

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

/**
 * Why a person's trust in a plugin wasn't saved: the plugin changed since
 * they were shown it, or it can't be read or checked now.
 */
export type PluginTrustRefusal =
  | TrustRefusal
  | { readonly kind: "broken"; readonly problems: readonly PluginProblem[] };

/** What {@link PluginService} needs from the host. */
export interface PluginServiceOptions {
  /** The profile's plugin folder, which holds one folder per plugin, named by its id. */
  readonly plugins: FolderReader;
  /** Hashes every file of a plugin. */
  readonly digest: Digest;
  /** The `TrustService`: plugins share its records with workspaces. */
  readonly trust: Pick<TrustService, "checkPlugin" | "grantPlugin" | "revoke">;
  /** The profile's records, which hold every plugin's setting values. */
  readonly records: RecordStore;
  /** Dates each saved setting value. */
  readonly clock: Clock;
}

/**
 * Finds, checks and trusts the plugins in the profile's plugin folder.
 *
 * @example
 * const plugins = new PluginService({ plugins: folderReader, digest, trust, records, clock });
 * const entries = await plugins.load();
 * for (const entry of entries) {
 *   if (entry.status === "broken") showProblems(entry.folder, entry.problems);
 * }
 * const tools = plugins.tools(entries);
 */
export class PluginService {
  readonly #options: PluginServiceOptions;
  readonly #settings: PluginSettings;

  constructor(options: PluginServiceOptions) {
    this.#options = options;
    this.#settings = new PluginSettings(options.records, options.clock);
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

  /**
   * Saves a person's trust in the plugin `id`, read again now, only when
   * `shownFingerprint` is exactly its current fingerprint.
   *
   * @param id - the plugin's id, which is its folder's name
   * @param shownFingerprint - the full fingerprint the person was shown
   * @throws a `RangeError` when `id` isn't a single folder name
   */
  async trust(
    id: string,
    shownFingerprint: string,
    origin: PersonTrustOrigin,
  ): Promise<Result<TrustGrant, PluginTrustRefusal>> {
    const folder = pluginFolderOf(id);
    let read: Awaited<ReturnType<typeof readPluginFolder>>;
    try {
      read = await readPluginFolder(this.#options.plugins, this.#options.digest, folder);
    } catch (error) {
      return err({ kind: "broken", problems: [readFailedProblem(error)] });
    }
    if (!read.ok) return err({ kind: "broken", problems: read.error });
    return await this.#options.trust.grantPlugin(read.value, shownFingerprint, origin);
  }

  /**
   * Forgets the trust in the plugin `id`, so it gives no tools and no UI
   * until a person trusts it again. Its settings and secrets stay: only
   * removing the plugin deletes them. Nothing happens when its folder is
   * gone, so removing a plugin forgets its trust before its folder.
   *
   * @param id - the plugin's id, which is its folder's name
   * @throws a `RangeError` when `id` isn't a single folder name
   */
  async revoke(id: string): Promise<void> {
    const location = await this.#options.plugins.locationOf(pluginFolderOf(id));
    if (location !== null) await this.#options.trust.revoke(location);
  }

  /**
   * The declared tools of every trusted plugin in `entries`, by part, with
   * the plugin's trust grant. A plugin that isn't trusted gives none.
   *
   * @param entries - what {@link load} gave
   */
  tools(entries: readonly PluginEntry[]): PluginToolSet[] {
    return trustedPluginTools(entries);
  }

  /**
   * The `ui` of every trusted plugin in `entries`, as plain data for Studio.
   *
   * @param entries - what {@link load} gave
   */
  ui(entries: readonly PluginEntry[]): PluginUiContribution[] {
    return trustedPluginUi(entries);
  }

  /**
   * The plugin's setting values: each saved one that still fits its
   * setting, otherwise the setting's `default`. `secret` settings are in
   * `Secrets`, so they aren't here.
   *
   * @param plugin - a plugin {@link load} read
   */
  async settings(plugin: Plugin): Promise<PluginSettingValues> {
    return await this.#settings.values(plugin);
  }

  /**
   * Saves the plugin's setting values in place of the saved ones, only when
   * every value fits a setting it declares and every required one is set.
   *
   * @param plugin - a plugin {@link load} read
   * @returns every problem found, when nothing was saved
   */
  async saveSettings(
    plugin: Plugin,
    values: Readonly<Record<string, unknown>>,
  ): Promise<Result<void, PluginSettingProblem[]>> {
    return await this.#settings.save(plugin, values);
  }

  /**
   * The name each secret the plugin declares is kept under in `Secrets`, by
   * the declared name, such as `plugin__weather__weather-key` for
   * `weather-key`. The loader and a local tool's `env` read a secret by this
   * name, and the host that removes the plugin deletes these names, so a
   * plugin never reads a secret stored for something else.
   *
   * @param plugin - a plugin {@link load} read
   */
  secretNames(plugin: Plugin): Record<string, string> {
    return pluginSecretNames(plugin);
  }

  /**
   * Deletes the setting values of the plugin `id`, for removing the plugin.
   * Its trust isn't touched here, and neither are its secrets: `Secrets` is
   * read-only in core, so the host deletes the {@link secretNames} with its
   * own secret writer first, and says so when one can't be deleted.
   */
  async forget(id: string): Promise<void> {
    await this.#settings.forget(id);
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

/**
 * The plugin folder of the plugin `id`: the id itself, which must be one
 * folder name, so a caller can't reach a folder inside a plugin or outside
 * the plugin folder.
 */
function pluginFolderOf(id: string): string {
  if (id === "" || id === "." || id === ".." || /[/\\]/u.test(id)) {
    throw new RangeError(`${JSON.stringify(id)} isn't a plugin id`);
  }
  return id;
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
