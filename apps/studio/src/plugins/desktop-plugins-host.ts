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
import { PluginFeed } from "./plugin-feed.ts";

/** What the desktop's plugins host is made of. */
export interface DesktopPluginsParts {
  /** The shell's IPC: the plugins folder, the plugins' records, the trust records and the keychain. */
  readonly ipc: TauriShell;
  /** The keychain, where a plugin's secrets live: `TauriSecrets`, or the window's `secrets` service. */
  readonly secrets: PluginsHost["secrets"];
  /** Calls a trusted plugin's tools through the agent host; it fails closed where plugins can't run fenced. */
  readonly caller: PluginsHost["caller"];
}

/** The desktop's plugins host, and the feed it keeps current. */
export interface DesktopPluginsHost {
  readonly host: PluginsHost;
  /** Reads the plugins folder again, so a window that comes to the front shows what changed. */
  readonly reload: () => Promise<void>;
}

/**
 * The plugins feature's host for the desktop app (`studio.desktop-plugins-host`): core's
 * `PluginService` over the shell's plugins folder, the profile's plugin records and the trust
 * records the CLI shares, the keychain for secrets (given in `secrets`), and one feed that every action reads again.
 * Adding a plugin stays a CLI action, so this host has no add. It never runs plugin code: tool
 * calls go through `caller`.
 *
 * @example
 * const { host, reload } = desktopPluginsHost({ ipc, caller });
 * await reload();
 */
export function desktopPluginsHost({
  ipc,
  secrets,
  caller,
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
  const reload = () => feed.reload();
  const changing = async <T>(change: () => Promise<T>): Promise<T> => {
    const result = await change();
    await reload();
    return result;
  };
  return {
    reload,
    host: {
      feed,
      caller,
      settings: service,
      secrets,
      actions: {
        trust: (plugin) =>
          changing(async () => {
            const entry = (await service.load()).find(
              (each) => each.status !== "broken" && each.folder === plugin,
            );
            if (entry === undefined || entry.status === "broken") {
              throw new Error("the plugin can't be read");
            }
            const trusted = await service.trust(plugin, entry.fingerprint, "prompt");
            if (!trusted.ok) throw new Error("the plugin changed since you reviewed it");
          }),
        revoke: (plugin) => changing(() => service.revoke(plugin)),
        remove: (plugin) =>
          changing(async () => {
            const removed = await service.remove(plugin, (name) => secrets.remove(name));
            return removed.ok ? ({ kind: "removed" } as const) : removed.error;
          }),
        usedBy: async () => {
          // Connectors live in each workspace's files; the app doesn't scan them all yet, and the
          // page says so rather than claiming nothing uses the plugin.
          throw new Error("Halonic can't look through every workspace yet");
        },
        reload,
        openFolder: async (plugin) => {
          const shown = await ipc.invoke(pluginFolderCommands.reveal, { plugin });
          if (shown === false) throw new Error("the plugin's folder isn't there");
        },
      },
    },
  };
}
