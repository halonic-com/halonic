import type { TauriShell } from "@halonicjs/adapter-fs-tauri";
import {
  pluginFolderCommands,
  TauriPluginFolderReader,
  TauriPluginFolderWriter,
  TauriRecordStore,
  TauriTrustStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import { PluginService, TrustService } from "@halonicjs/app";
import { systemClock } from "@halonicjs/std";
import type { PluginsHost } from "@halonicjs/studio-feature-plugins/api";
import { halonicVersion } from "../studio/open-trusts.ts";
import { desktopPluginInstaller } from "./desktop-plugin-installer.ts";
import { desktopPluginActions } from "./plugin-actions.ts";
import { PluginFeed } from "./plugin-feed.ts";

/** What the desktop's plugins host is made of. */
export interface DesktopPluginsParts {
  /** The shell's IPC: the plugins folder, the plugins' records, the trust records and the keychain. */
  readonly ipc: TauriShell;
  /** The keychain, where a plugin's secrets live: `TauriSecrets`, or the window's `secrets` service. */
  readonly secrets: PluginsHost["secrets"];
  /** Calls a trusted plugin's tools through the agent host; it fails closed where plugins can't run fenced. */
  readonly caller: PluginsHost["caller"];
  /** Told when a change was saved but reading the plugins folder again failed. */
  readonly onReloadFailed: (error: unknown) => void;
}

/** The desktop's plugins host, and the feed it keeps current. */
export interface DesktopPluginsHost {
  /** What the plugins feature reads and calls. */
  readonly host: PluginsHost;
  /** Reads the plugins folder again, so a window that comes to the front shows what changed. */
  readonly reload: () => Promise<void>;
}

/**
 * The plugins feature's host for the desktop app (`studio.desktop-plugins-host`): core's
 * `PluginService` over the shell's plugins folder, the profile's plugin records and the trust
 * records the CLI shares, the keychain for secrets (given in `secrets`), and one feed that every action reads again.
 * Its installer adds a plugin from a folder the person picks or a git repository, not trusted
 * (`desktopPluginInstaller`). It never runs plugin code: tool calls go through `caller`.
 *
 * @example
 * const { host, reload } = desktopPluginsHost({ ipc, secrets, caller, onReloadFailed });
 * await reload();
 */
export function desktopPluginsHost({
  ipc,
  secrets,
  caller,
  onReloadFailed,
}: DesktopPluginsParts): DesktopPluginsHost {
  const service = new PluginService({
    plugins: new TauriPluginFolderReader(ipc),
    writer: new TauriPluginFolderWriter(ipc),
    digest: webCryptoDigest,
    trust: new TrustService({
      store: new TauriTrustStore(ipc),
      digest: webCryptoDigest,
      clock: systemClock,
      appVersion: halonicVersion,
    }),
    records: new TauriRecordStore(ipc, { scope: "plugins" }),
    clock: systemClock,
  });
  const feed = new PluginFeed(service);
  const actions = desktopPluginActions({
    service,
    feed,
    secrets,
    reveal: async (plugin) => (await ipc.invoke(pluginFolderCommands.reveal, { plugin })) === true,
    onReloadFailed,
  });
  return {
    reload: actions.reload,
    host: {
      feed,
      caller,
      settings: service,
      secrets,
      actions,
      installer: desktopPluginInstaller({ ipc, service, reload: actions.reload, onReloadFailed }),
    },
  };
}
