// The one way a command opens the plugin service on this computer: the
// profile's plugins folder and records, the trust records every plugin
// shares with workspaces, the profile's sign-in grants, which removing a
// plugin or its trust signs out, and the CLI's digest, so every `halonic
// plugin` command and `halonic trust --plugin` read one plugin the same way.

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  FileRecordStore,
  FileSystemFolderReader,
  FileSystemPluginFolder,
  FileTrustStore,
} from "@halonicjs/adapter-fs-node";
import { bothSpellings } from "@halonicjs/adapter-system-node";
import { type DeletePluginSecret, type LocalToolState, PluginService } from "@halonicjs/app";
import type { Clock, HttpClient } from "@halonicjs/ports";
import {
  type ProfileEnvironment,
  pluginRecordsFolder,
  pluginsFolder,
  profileFolder,
  trustFolder,
} from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { GitExporter } from "./commands/plugin/git-source.ts";
import { cliPluginSignOut } from "./plugin-sign-out.ts";
import { nodeLocalToolState } from "./sandbox-works.ts";
import { chainedSecrets } from "./secret-host.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";
import { cliTrustService } from "./workspace-trust.ts";

/** What the plugin commands use on this computer, so tests can fix the profile folder and the clock. */
export interface PluginSetup {
  /** Where the profile folder is; this process's by default. */
  readonly profile?: ProfileEnvironment;
  /** The computer's own clock by default. */
  readonly clock?: Clock;
  /** How `plugin add` exports a git address; the git on the `PATH`, hardened, by default. */
  readonly exportGit?: GitExporter;
  /** Whether a plugin's programs can run here; this computer's srt sandbox is asked by default. */
  readonly localToolState?: () => Promise<LocalToolState>;
  /** Where removing a plugin or its trust revokes its sign-ins; the Node client for public hosts by default. */
  readonly http?: HttpClient;
}

/**
 * Whether the programs of `plugins` can run on this computer, or `undefined`
 * when none of them has a program, so the sandbox is only asked when a line
 * shows the answer.
 *
 * @example
 * await programsRunFor({}, [entry.content]);
 * // "sandbox-unavailable"
 */
export async function programsRunFor(
  setup: PluginSetup,
  plugins: readonly { readonly localTools: readonly unknown[] }[],
): Promise<LocalToolState["kind"] | undefined> {
  if (plugins.every((plugin) => plugin.localTools.length === 0)) return undefined;
  const state = await (setup.localToolState ?? nodeLocalToolState)();
  return state.kind;
}

/**
 * The plugin service over the profile's plugins folder. Nothing is created
 * until a plugin is added. It refuses to add a plugin from Halonic's own
 * data: the profile folder and, when `cwd` is given and holds one, its
 * workspace's `.studio` data, each as written and with links resolved.
 *
 * @param cwd - the folder the command runs in, for `plugin add`
 * @throws when `HALONIC_HOME` or the home folder isn't an absolute folder
 *
 * @example
 * const entries = await openPluginService({}).load();
 */
export function openPluginService(setup: PluginSetup, cwd?: string): PluginService {
  const environment = setup.profile ?? nodeProfileEnvironment();
  const profile = profileFolder(environment);
  const clock = setup.clock ?? systemClock;
  const folder = pluginsFolder(profile);
  return new PluginService({
    plugins: new FileSystemFolderReader(folder),
    writer: new FileSystemPluginFolder(folder, { clock }),
    digest: webCryptoDigest,
    trust: cliTrustService(new FileTrustStore(trustFolder(profile)), clock),
    records: new FileRecordStore(pluginRecordsFolder(profile)),
    clock,
    signOut: cliPluginSignOut({
      profile,
      secrets: chainedSecrets(environment.variables, () => environment),
      clock,
      ...(setup.http === undefined ? {} : { http: setup.http }),
    }),
    halonicData: halonicDataFolders(profile.root, cwd),
  });
}

/** The profile folder and the workspace data in `cwd`, when there is one, in both spellings each. */
function halonicDataFolders(profile: string, cwd: string | undefined): string[] {
  const workspaceData = cwd === undefined ? undefined : join(cwd, ".studio");
  const folders = [profile];
  if (workspaceData !== undefined && existsSync(workspaceData)) folders.push(workspaceData);
  return folders.flatMap(bothSpellings);
}

/**
 * How `plugin remove` deletes a plugin's secrets on this computer: there is
 * nothing to delete. The CLI reads secrets from the environment, which
 * Halonic never writes, so it never stores a plugin's secret either.
 */
export const deletePluginSecret: DeletePluginSecret = async () => {};

/**
 * Whether a key for the plugin is stored on this computer, so `plugin remove`
 * can say it removes it. Never, for the same reason as
 * {@link deletePluginSecret}; the plugin's declared secrets don't count.
 */
export function storesPluginSecret(_id: string): boolean {
  return false;
}
