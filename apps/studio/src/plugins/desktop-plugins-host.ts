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
import type { Secrets } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import type { PluginsHost, PluginUnfencedRuns } from "@halonicjs/studio-feature-plugins/api";
import { halonicVersion } from "../studio/open-trusts.ts";
import { desktopPluginInstaller } from "./desktop-plugin-installer.ts";
import { desktopPluginActions } from "./plugin-actions.ts";
import { PluginFeed } from "./plugin-feed.ts";
import { type PluginSecretHandOver, secretHandingCaller } from "./secret-handing-caller.ts";

/** What the desktop's plugins host is made of. */
export interface DesktopPluginsParts {
  /** The shell's IPC: the plugins folder, the plugins' records, the trust records and the keychain. */
  readonly ipc: TauriShell;
  /** The keychain, where a plugin's secrets live: `TauriSecrets`, or the window's `secrets` service. */
  readonly secrets: PluginsHost["secrets"] & Secrets;
  /** Calls a trusted plugin's tools through the agent host; it fails closed where plugins can't run fenced. */
  readonly caller: PluginsHost["caller"];
  /** Hands a plugin's secrets to the agent host before each call: `AgentHostPluginSecrets`. */
  readonly handOver: PluginSecretHandOver;
  /** The agent host's integration sign-ins, for the Sign-ins section of a plugin's page. */
  readonly signIns: NonNullable<PluginsHost["signIns"]>;
  /** Told when a change was saved but reading the plugins folder again failed. */
  readonly onReloadFailed: (error: unknown) => void;
  /** The agent host's sandbox status and the yes to run without it, which the trust check reads. */
  readonly unfencedRuns?: PluginUnfencedRuns;
  /** Whether the plugins' programs can run here, which the trust check reads when it opens (`desktopProgramsRun`). */
  readonly programs?: PluginsHost["actions"]["programs"];
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
 * (`desktopPluginInstaller`). It never runs plugin code: tool calls go through `caller`, each
 * after `handOver` gave the agent host the plugin's own secrets (`secretHandingCaller`), and
 * sign-ins go through `signIns`, both to the agent host.
 *
 * @example
 * const { host, reload } = desktopPluginsHost({ ipc, secrets, caller, handOver, signIns, onReloadFailed });
 * await reload();
 */
export function desktopPluginsHost({
  ipc,
  secrets,
  caller,
  handOver,
  signIns,
  onReloadFailed,
  unfencedRuns,
  programs,
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
  const actions = {
    ...desktopPluginActions({
      service,
      feed,
      secrets,
      reveal: async (plugin) =>
        (await ipc.invoke(pluginFolderCommands.reveal, { plugin })) === true,
      onReloadFailed,
    }),
    ...(unfencedRuns === undefined ? {} : { unfencedRuns }),
    ...(programs === undefined ? {} : { programs }),
  };
  return {
    reload: actions.reload,
    host: {
      feed,
      caller: secretHandingCaller({
        caller,
        handOver,
        keychain: secrets,
        secretNames: (plugin) => {
          const manifest = feed.current().find((each) => each.plugin === plugin)?.manifest;
          return manifest === undefined ? {} : service.secretNames(manifest);
        },
      }),
      settings: service,
      secrets,
      signIns,
      actions,
      installer: desktopPluginInstaller({ ipc, service, reload: actions.reload, onReloadFailed }),
    },
  };
}
