// The one way a command opens the plugin service on this computer: the
// profile's plugins folder and records, the trust records every plugin
// shares with workspaces, and the CLI's digest, so every `halonic plugin`
// command and `halonic trust --plugin` read one plugin the same way.

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  FileRecordStore,
  FileSystemFolderReader,
  FileSystemPluginFolder,
  FileTrustStore,
} from "@halonicjs/adapter-fs-node";
import { bothSpellings } from "@halonicjs/adapter-system-node";
import { type DeletePluginSecret, PluginService } from "@halonicjs/app";
import type { Clock } from "@halonicjs/ports";
import {
  type ProfileEnvironment,
  pluginRecordsFolder,
  pluginsFolder,
  profileFolder,
  trustFolder,
} from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { GitExporter } from "./commands/plugin/git-source.ts";
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
  const profile = profileFolder(setup.profile ?? nodeProfileEnvironment());
  const clock = setup.clock ?? systemClock;
  const folder = pluginsFolder(profile);
  return new PluginService({
    plugins: new FileSystemFolderReader(folder),
    writer: new FileSystemPluginFolder(folder, { clock }),
    digest: webCryptoDigest,
    trust: cliTrustService(new FileTrustStore(trustFolder(profile)), clock),
    records: new FileRecordStore(pluginRecordsFolder(profile)),
    clock,
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
