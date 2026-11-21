import {
  AgentHostIntegrationSignIns,
  AgentHostPluginSecrets,
  AgentHostPluginToolCaller,
  type AgentHostTransport,
  AgentHostUnfencedRuns,
} from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import { shellKeychain, type TauriIpc } from "@halonicjs/studio-services";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";
import { type DesktopPluginsHost, desktopPluginsHost } from "./desktop-plugins-host.ts";
import { desktopProgramsRun } from "./programs-run.ts";
import { desktopUnfencedRuns } from "./unfenced-runs.ts";

/**
 * The plugins are the profile's, not a folder's, so a window has one host that every open
 * folder shares; a second host would read the plugins folder again and keep a second feed.
 */
const hosts = new WeakMap<object, DesktopPluginsHost>();

/**
 * Gives the open folder the plugins feature's host (`studio.desktop-plugins-host`). Tool calls and
 * sign-ins go through the agent host, which refuses tool calls where plugins can't run fenced unless
 * the person's saved yes is for the reason at that start; the trust check reads and saves that yes
 * there too. The plugins folder is read again whenever the window comes to the front, so a plugin
 * added with `halonic plugin add` shows up without a restart. Without the agent host's transport there is no host to give, and
 * nothing is provided.
 *
 * The focus listener and the window's entry in `hosts` live as long as the window, on purpose:
 * the host is shared by every folder, so nothing here is tied to one folder's lifetime, and the
 * disposer `onFocus` returns is dropped.
 */
export function providePlugins(
  services: ServiceRegistry,
  parts: {
    readonly ipc: TauriIpc;
    readonly window: object;
    /** The agent host's transport; `undefined` where the page has no agent host. */
    readonly transport: AgentHostTransport | undefined;
    /** The computer's operating system: on Windows the trust check isn't told whether programs run. */
    readonly platform: KeyboardPlatform;
    readonly onFocus: (listener: () => void) => () => void;
    readonly onReloadFailed: (error: unknown) => void;
  },
): void {
  const known = hosts.get(parts.window);
  if (known !== undefined) {
    services.provide(PluginsHostService, known.host);
    return;
  }
  const { transport } = parts;
  if (transport === undefined) return;
  const signIns = new AgentHostIntegrationSignIns(transport);
  const plugins = desktopPluginsHost({
    ipc: parts.ipc,
    secrets: shellKeychain(parts.ipc),
    caller: new AgentHostPluginToolCaller(transport),
    handOver: new AgentHostPluginSecrets(transport),
    signIns,
    // A plugin's sign-ins are signed in under its id.
    signOut: async (plugin) => void (await signIns.signOutAll(plugin)),
    onReloadFailed: parts.onReloadFailed,
    unfencedRuns: desktopUnfencedRuns(new AgentHostUnfencedRuns(transport)),
    programs: desktopProgramsRun(transport, parts.platform),
  });
  hosts.set(parts.window, plugins);
  const reload = (): void => {
    plugins.reload().catch(parts.onReloadFailed);
  };
  reload();
  parts.onFocus(reload);
  services.provide(PluginsHostService, plugins.host);
}
