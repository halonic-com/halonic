// The one way a command opens the plugin service on this computer: the
// profile's plugins folder and records, the trust records every plugin
// shares with workspaces, and the CLI's digest, so every `halonic plugin`
// command and `halonic trust --plugin` read one plugin the same way.

import {
  FileRecordStore,
  FileSystemFolderReader,
  FileSystemPluginFolder,
  FileTrustStore,
} from "@halonicjs/adapter-fs-node";
import { PluginService } from "@halonicjs/app";
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
 * until a plugin is added.
 *
 * @throws when `HALONIC_HOME` or the home folder isn't an absolute folder
 *
 * @example
 * const entries = await openPluginService({}).load();
 */
export function openPluginService(setup: PluginSetup): PluginService {
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
  });
}
