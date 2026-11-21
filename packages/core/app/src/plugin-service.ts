// The plugin service, as `app.plugin-service` asks: it finds every plugin in
// the profile's plugin folder, reads and checks each one and asks whether it
// is trusted (P2 plan sections 1 and 5). It adds a plugin from a source
// folder, as `app.plugin-add` asks (P3 plan, steps 1 to 4), removes one with
// its trust, secrets and settings, as `app.plugin-remove` asks, saves and
// forgets a person's trust, keeps each plugin's setting values, which only
// removing the plugin deletes, and gives the tools and UI of the trusted
// ones. The CLI and the Studio call it; it reaches the folder, the trust
// records and the setting values only through ports. What it gives and takes
// is in `plugin-service-types.ts`.

import type { Plugin } from "@halonicjs/format";
import type {
  Clock,
  Digest,
  FolderEntry,
  FolderReader,
  PluginFolderWriter,
  RecordStore,
  TrustGrant,
} from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import {
  type PluginToolSet,
  type PluginUiContribution,
  trustedPluginTools,
  trustedPluginUi,
} from "./plugin-contributions.ts";
import { type PluginProblem, readPluginFolder } from "./plugin-folder.ts";
import { type PluginInstall, PluginInstalls } from "./plugin-installs.ts";
import { pluginSecretNames } from "./plugin-secret-names.ts";
import {
  notAFolderProblem,
  readFailedProblem,
  unsafeNameProblem,
} from "./plugin-service-problems.ts";
import type {
  AddedPluginEntry,
  AddPluginOptions,
  BrokenPlugin,
  DeletePluginSecret,
  PluginAddRefusal,
  PluginEntry,
  PluginRemoveRefusal,
  PluginTrustRefusal,
  SignOutPlugin,
} from "./plugin-service-types.ts";
import {
  type PluginSettingProblem,
  PluginSettings,
  type PluginSettingValues,
} from "./plugin-settings.ts";
import { overlapsHalonicData, PluginSourceSnapshot, sourceFolder } from "./plugin-source.ts";
import type { PersonTrustOrigin } from "./trust-record.ts";
import type { TrustService } from "./trust-service.ts";

/** What {@link PluginService} needs from the host. */
export interface PluginServiceOptions {
  /** The profile's plugin folder, which holds one folder per plugin, named by its id. */
  readonly plugins: FolderReader;
  /** Places and removes plugin folders in the same folder `plugins` reads. */
  readonly writer: PluginFolderWriter;
  /** Hashes every file of a plugin. */
  readonly digest: Digest;
  /** The `TrustService`: plugins share its records with workspaces. */
  readonly trust: Pick<TrustService, "checkPlugin" | "grantPlugin" | "revoke">;
  /** The profile's records, which hold every plugin's setting values and install record. */
  readonly records: RecordStore;
  /** Dates each saved setting value. */
  readonly clock: Clock;
  /**
   * Signs out the plugin's sign-ins when its trust is forgotten or it is
   * removed, so a plugin added later under the same id isn't signed in.
   */
  readonly signOut: SignOutPlugin;
  /**
   * Halonic's own data folders on this computer that a plugin's source must
   * stay clear of, each absolute and in every spelling the host knows (as
   * written, with links resolved): the profile folder, and the open
   * workspace's `.studio` data. Any workspace's `.studio` is refused
   * without being named here. None by default.
   */
  readonly halonicData?: readonly string[];
}

/**
 * Finds, checks and trusts the plugins in the profile's plugin folder.
 *
 * @example
 * const plugins = new PluginService({ plugins: folderReader, writer, digest, trust, records, clock, signOut });
 * const entries = await plugins.load();
 * for (const entry of entries) {
 *   if (entry.status === "broken") showProblems(entry.folder, entry.problems);
 * }
 * const tools = plugins.tools(entries);
 */
export class PluginService {
  readonly #options: PluginServiceOptions;
  readonly #settings: PluginSettings;
  readonly #installs: PluginInstalls;

  constructor(options: PluginServiceOptions) {
    this.#options = options;
    this.#settings = new PluginSettings(options.records, options.clock);
    this.#installs = new PluginInstalls(options.records, options.clock);
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
   * Adds the plugin in the folder `source` to the plugins folder, as a
   * folder named by its id, and keeps where it came from. The source is
   * read once and checked as `load` checks a plugin folder, and exactly the
   * bytes that were hashed are placed, so a source that changes meanwhile
   * can't slip in a file that wasn't checked. A plugin that can't be read
   * or checked is refused before anything is written. A new copy that
   * can't be read back is taken out again and refused the same way.
   *
   * A source whose real location is, holds or is inside Halonic's own data
   * (`halonicData`, or any workspace's `.studio`) is refused as
   * `halonic-data` before anything in it is read.
   *
   * It doesn't trust the plugin: the entry it gives is new, or changed when
   * it replaced one, until a person trusts it with {@link trust}.
   *
   * @param source - the plugin's folder, read through its own `FolderReader`
   * A path the sandbox denies in a home folder, such as `.ssh`, is left out
   * of the copy at any depth, as a private name such as `.env` is, and the
   * entry names it in `leftOut`.
   *
   * @returns the added plugin, as {@link load} gives it now
   */
  async add(
    source: FolderReader,
    options: AddPluginOptions,
  ): Promise<Result<AddedPluginEntry, PluginAddRefusal>> {
    if (await this.#overlapsHalonicData(source)) return err({ kind: "halonic-data" });
    const snapshot = new PluginSourceSnapshot(source);
    let read: Awaited<ReturnType<typeof readPluginFolder>>;
    try {
      read = await readPluginFolder(snapshot, this.#options.digest, sourceFolder, {
        namedById: false,
      });
    } catch (error) {
      return err({ kind: "broken", problems: [readFailedProblem(error)] });
    }
    if (!read.ok) return err({ kind: "broken", problems: read.error });
    const { plugin, files } = read.value;
    const placed = snapshot.files();
    const unsafe = unsafeNameProblem(plugin.id, placed);
    if (unsafe !== null) return err({ kind: "broken", problems: [unsafe] });

    // A secret the version being replaced had stays in `Secrets` until the
    // plugin is removed, so its name stays in the install record too.
    const replacedSecretNames = options.replace ? await this.#replacedSecretNames(plugin.id) : {};
    const placement = await this.#options.writer.place(plugin.id, placed, {
      replace: options.replace,
    });
    if (placement === "taken") return err({ kind: "taken", id: plugin.id, name: plugin.name });
    await this.#installs.save(plugin.id, {
      source: options.from,
      files,
      secretNames: { ...replacedSecretNames, ...pluginSecretNames(plugin) },
    });
    const entry = await this.#loadOne({ path: plugin.id, kind: "folder" });
    if (entry.status === "broken" && !options.replace) {
      // The copy read back isn't what was checked, such as when something
      // else wrote in the plugins folder meanwhile. Take it out again, so a
      // refused add leaves nothing behind, as one refused before writing.
      // A replaced version is gone already, so that copy is kept and shown.
      await this.#installs.forget(plugin.id);
      await this.#options.writer.remove(plugin.id);
      return err({ kind: "broken", problems: entry.problems });
    }
    return ok({ ...entry, leftOut: snapshot.deniedLeftOut() });
  }

  /**
   * Whether the source's real location overlaps Halonic's own data. A
   * source with no location, or whose reader fails, is left to the read,
   * which refuses it with its reason.
   */
  async #overlapsHalonicData(source: FolderReader): Promise<boolean> {
    const real = await source.locationOf().catch(() => null);
    return real !== null && overlapsHalonicData(real, this.#options.halonicData ?? []);
  }

  /**
   * Where the plugin `id` was added from, its files' hashes then and its
   * secret names, or `null` when it wasn't added through {@link add}.
   */
  async install(id: string): Promise<PluginInstall | null> {
    return await this.#installs.get(pluginFolderOf(id));
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
   * until a person trusts it again, and signs out each of its sign-ins first,
   * while the plugin can still read its client secret for the revoke. Its
   * settings and secrets stay: only removing the plugin deletes them. The
   * trust is forgotten also when the sign-out fails, and then the sign-out's
   * error is thrown, so running it again finishes the job. When its folder
   * is gone only the sign-out runs, so removing a plugin forgets its trust
   * before its folder.
   *
   * @param id - the plugin's id, which is its folder's name
   * @throws a `RangeError` when `id` isn't a single folder name, and what the sign-out throws
   */
  async revoke(id: string): Promise<void> {
    const folder = pluginFolderOf(id);
    try {
      await this.#options.signOut(folder);
    } finally {
      // A sign-in that couldn't be signed out never keeps a plugin trusted.
      const location = await this.#options.plugins.locationOf(folder);
      if (location !== null) await this.#options.trust.revoke(location);
    }
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
   * Deletes the setting values of the plugin `id`. Its trust isn't touched
   * here, and neither are its secrets: {@link remove} does all of it.
   */
  async forget(id: string): Promise<void> {
    await this.#settings.forget(id);
  }

  /**
   * Removes the plugin `id` and everything kept for it, in this order, so a
   * folder is never gone while its trust, sign-ins, secrets or settings are left:
   *
   * 1. its sign-ins, signed out with `signOut`, and then its trust, when its
   *    entry is a real folder (a link is never trusted, and is never
   *    followed); a sign-out that fails is thrown once the trust is gone;
   * 2. every secret it declares now or declared when it was added, with
   *    `deleteSecret`; at the first that fails it stops, naming it;
   * 3. its settings and its install record;
   * 4. its entry in the plugins folder: a folder with everything in it, or
   *    a link itself, never what it points to.
   *
   * Running it again after a failure finishes the job. Only the entry with
   * exactly the id is removed: `remove("weather")` leaves `Weather`.
   *
   * @param id - the plugin's id, which is its folder's name
   * @throws a `RangeError` when `id` isn't a single folder name, and what
   *   the sign-out, the trust store, the records or the plugins folder throw
   */
  async remove(
    id: string,
    deleteSecret: DeletePluginSecret,
  ): Promise<Result<void, PluginRemoveRefusal>> {
    const folder = pluginFolderOf(id);
    const entry = await this.#topEntry(folder);
    if (entry?.kind === "folder") await this.revoke(folder);
    else await this.#options.signOut(folder);
    for (const [secret, storedName] of Object.entries(
      await this.#storedSecretNames(entry, folder),
    )) {
      try {
        await deleteSecret(storedName);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return err({ kind: "secret", secret, reason });
      }
    }
    await this.#settings.forget(folder);
    await this.#installs.forget(folder);
    await this.#options.writer.remove(folder);
    return ok(undefined);
  }

  /**
   * Every secret name of the plugin `folder`, by declared name: those its
   * install record kept, and those its folder declares now when it can be
   * read. A plugin that can't be read is removed with the names it was
   * added with.
   */
  async #storedSecretNames(
    entry: FolderEntry | undefined,
    folder: string,
  ): Promise<Record<string, string>> {
    const names: Record<string, string> = { ...(await this.#installs.get(folder))?.secretNames };
    if (entry?.kind !== "folder") return names;
    try {
      const read = await readPluginFolder(this.#options.plugins, this.#options.digest, folder);
      if (read.ok) Object.assign(names, pluginSecretNames(read.value.plugin));
    } catch {
      // Unreadable now: the install record's names are all there is.
    }
    return names;
  }

  /**
   * Every secret name of the plugin `folder` that `add` is about to replace:
   * those its install record kept and those it declares now, so none of them
   * is forgotten when the new version declares fewer.
   */
  async #replacedSecretNames(folder: string): Promise<Record<string, string>> {
    return await this.#storedSecretNames(await this.#topEntry(folder), folder);
  }

  /** The entry named exactly `folder` at the top of the plugins folder, if any. */
  async #topEntry(folder: string): Promise<FolderEntry | undefined> {
    const top = await this.#options.plugins.entries(undefined, { recursive: false });
    return top.find((found) => found.path === folder);
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
