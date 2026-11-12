// A trusted plugin's backend in the isolated worker, as `app.plugin-backend`
// asks (plugins ADR, sections 1.1 and 3; I5 design 4.2, HAL-958). Every start
// of the backend's runner, the restart after an idle stop included, reads the
// plugin folder again, checks the person's trust against what is in it now,
// and only then goes through the start gate. There is no in-process path: a
// plugin from a folder or git never loads its code on Halonic's side.
//
// The fence status is the gate's and is read per start. A saved yes for
// running without the fence is never part of the plugin's trust, so it can
// never stand in for it. On Windows the gate always reports `not-fenced` with
// `windows` (Julian's build conditions (a) and (b), HAL-1873 design 11).

import type { Plugin } from "@halonicjs/format";
import type { Digest, FolderReader, Sandbox } from "@halonicjs/ports";
import { type PluginFolder, type PluginProblem, readPluginFolder } from "./plugin-folder.ts";
import { pluginSecretNames } from "./plugin-secret-names.ts";
import type { PluginSettingValues } from "./plugin-settings.ts";
import type { GatedRunner, GatedStart, RunnerStartGate } from "./runner-start-gate.ts";
import type { TrustService } from "./trust-service.ts";

/**
 * Why a plugin's backend didn't start for lack of trust.
 *
 * - `unreadable`: the plugin folder can't be read or checked now; `problems` says why.
 * - `no-backend`: the plugin declares no backend.
 * - `not-trusted`: a person never trusted the plugin, or took their trust back.
 * - `changed`: the manifest or a file changed since the person trusted it.
 * - `record-unreadable`: the plugin's trust record can't be read.
 */
export type PluginBackendTrustReason =
  | "unreadable"
  | "no-backend"
  | "not-trusted"
  | "changed"
  | "record-unreadable";

/** A plugin's backend didn't start, because the trust a person gave doesn't cover what is in its folder now. */
export class PluginBackendNotTrustedError extends Error {
  override readonly name = "PluginBackendNotTrustedError";
  readonly plugin: string;
  readonly reason: PluginBackendTrustReason;
  /** For `unreadable`, what is wrong with the folder; otherwise empty. */
  readonly problems: readonly PluginProblem[];

  constructor(
    plugin: string,
    reason: PluginBackendTrustReason,
    problems: readonly PluginProblem[] = [],
  ) {
    super(notTrustedMessage(plugin, reason, problems));
    this.plugin = plugin;
    this.reason = reason;
    this.problems = problems;
  }
}

/**
 * The plugin as it was read and found trusted at this start: what the person
 * trusted, and so the only files and manifest the start may run. `startIn`
 * gets it, so nothing has to read the folder a second time and take what a
 * change in between left there.
 */
export interface TrustedPluginBackend extends PluginFolder {
  /** The fingerprint the trust covers: the hash of the manifest and of every file in `files`. */
  readonly fingerprint: string;
}

/**
 * Starts the runner in the sandbox the gate picked, for the plugin that was
 * checked. Load only the files in `trusted.files`, and only when each one's
 * bytes still hash to what is listed there.
 */
export type StartTrustedBackend<Runner extends GatedRunner> = (
  sandbox: Sandbox,
  trusted: TrustedPluginBackend,
) => Promise<Runner>;

/** What {@link PluginBackendStart} needs from the host. */
export interface PluginBackendStartOptions {
  /** The profile's plugin folder, which holds one folder per plugin, named by its id. */
  readonly plugins: FolderReader;
  /** For the hash of every file, the same one the trust check uses. */
  readonly digest: Digest;
  /** The `TrustService` that holds the person's trust in plugins. */
  readonly trust: Pick<TrustService, "checkPlugin">;
  /** The gate that picks the sandbox once trust is settled. */
  readonly gate: RunnerStartGate;
}

/**
 * Starts plugin backends' runners only with a trust that covers them.
 *
 * @example
 * const starts = new PluginBackendStart({ plugins, digest, trust, gate });
 * const gated = await starts.start("weather", (sandbox, trusted) =>
 *   startRunner({ ...options, sandbox, files: trusted.files }),
 * );
 * if (gated.run === "needs-yes") showTrustCheck(gated.reason);
 */
export class PluginBackendStart {
  readonly #options: PluginBackendStartOptions;

  constructor(options: PluginBackendStartOptions) {
    this.#options = options;
  }

  /**
   * Reads the plugin `id` as it is in the plugins folder now, checks that
   * its trust is `trusted` for exactly these files and this manifest, then
   * starts its backend's runner through the start gate. `startIn` gets
   * the plugin as it was checked, so it runs those files and no others.
   *
   * @param id - the plugin's id, which is its folder's name
   * @throws a `RangeError` when `id` isn't a single folder name
   * @throws PluginBackendNotTrustedError when the trust doesn't cover it; `startIn` is never called then
   * @throws what the gate or `startIn` throws
   */
  async start<Runner extends GatedRunner>(
    id: string,
    startIn: StartTrustedBackend<Runner>,
  ): Promise<GatedStart<Runner>> {
    const trusted = await this.#checkTrust(id);
    return await this.#options.gate.start((sandbox) => startIn(sandbox, trusted));
  }

  async #checkTrust(id: string): Promise<TrustedPluginBackend> {
    const { plugins, digest, trust } = this.#options;
    if (id === "" || id === "." || id === ".." || /[/\\]/u.test(id)) {
      throw new RangeError(`${JSON.stringify(id)} isn't a plugin id`);
    }
    const read = await readPluginFolder(plugins, digest, id).catch((error: unknown) => {
      throw new PluginBackendNotTrustedError(id, "unreadable", [readFailed(error)]);
    });
    if (!read.ok) throw new PluginBackendNotTrustedError(id, "unreadable", read.error);
    const { plugin, location, files } = read.value;
    if (plugin.backend === undefined) throw new PluginBackendNotTrustedError(id, "no-backend");
    const check = await trust.checkPlugin({ location, plugin, files });
    // Anything but `trusted` refuses, so a status added later fails closed.
    if (check.status === "trusted")
      return { plugin, location, files, fingerprint: check.fingerprint };
    throw new PluginBackendNotTrustedError(id, untrustedReason(check.status));
  }
}

/** The reason a check that isn't `trusted` gives for refusing the start. */
function untrustedReason(
  status: Exclude<Awaited<ReturnType<TrustService["checkPlugin"]>>["status"], "trusted">,
): PluginBackendTrustReason {
  switch (status) {
    case "new":
      return "not-trusted";
    case "changed":
      return "changed";
    case "unreadable":
      return "record-unreadable";
    default:
      // A status added later still refuses; it needs a reason of its own.
      return "not-trusted";
  }
}

/** What the kit's loader takes as the person's choices for a backend. */
export interface PluginBackendChoices {
  /** The plugin's plain setting values, which the backend reads as `host.settings`. Never a secret. */
  readonly settings: Readonly<Record<string, unknown>>;
  /** The name each secret the backend declares is stored under in `Secrets`, by declared name. */
  readonly secretNames: Readonly<Record<string, string>>;
}

/**
 * The choices the loader needs to build a backend's host: the plugin's saved
 * setting values and where each of the backend's secrets is stored. A `secret`
 * setting is in `Secrets`, and Halonic places it in requests; its value is
 * never in `settings`, so no value of one reaches the plugin's code.
 *
 * @param plugin - a plugin that was read and checked
 * @param settings - what `PluginService.settings` gave for it
 *
 * @example
 * pluginBackendChoices(weather, { units: "metric" });
 * // { settings: { units: "metric" }, secretNames: { "example-key": "plugin__weather__example-key" } }
 */
export function pluginBackendChoices(
  plugin: Plugin,
  settings: PluginSettingValues,
): PluginBackendChoices {
  const stored = pluginSecretNames(plugin);
  const secretNames = Object.fromEntries(
    Object.keys(plugin.backend?.secrets ?? {}).map((name) => [name, storedName(stored, name)]),
  );
  return { settings, secretNames };
}

/** Where the secret `name` is stored; a declared secret always has a name, so a missing one is a bug, never a fallback to the bare name. */
function storedName(stored: Record<string, string>, name: string): string {
  const storedAs = stored[name];
  if (storedAs === undefined) throw new Error(`The plugin's secret ${name} has no stored name.`);
  return storedAs;
}

function readFailed(error: unknown): PluginProblem {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    code: "read-failed",
    file: "",
    path: [],
    message: `Halonic couldn't read the plugin: ${reason}.`,
  };
}

function notTrustedMessage(
  plugin: string,
  reason: PluginBackendTrustReason,
  problems: readonly PluginProblem[],
): string {
  switch (reason) {
    case "unreadable":
      return `The plugin ${plugin} doesn't start: ${problems.map((problem) => problem.message).join(" ")}`;
    case "no-backend":
      return `The plugin ${plugin} has no backend to start.`;
    case "not-trusted":
      return `The plugin ${plugin} runs code, so its backend starts only once you trust it.`;
    case "changed":
      return `The plugin ${plugin} changed since you trusted it, so its backend doesn't start. Trust it again to run it.`;
    case "record-unreadable":
      return `The plugin ${plugin} doesn't start: its trust record can't be read.`;
  }
}
