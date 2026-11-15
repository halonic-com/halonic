import { AgentHostPluginToolCaller } from "@halonicjs/adapter-agent-host-client";
import type { ServiceRegistry } from "@halonicjs/app";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import { shellKeychain, type TauriIpc, tauriAgentHostTransport } from "@halonicjs/studio-services";
import { type DesktopPluginsHost, desktopPluginsHost } from "./desktop-plugins-host.ts";

/**
 * The plugins are the profile's, not a folder's, so a window has one host that every open
 * folder shares; a second host would read the plugins folder again and keep a second feed.
 */
const hosts = new WeakMap<object, DesktopPluginsHost>();

/**
 * Gives the open folder the plugins feature's host (`studio.desktop-plugins-host`). Tool calls go
 * through the agent host, which refuses them where plugins can't run fenced. The plugins folder
 * is read again whenever the window comes to the front, so a plugin added with `halonic plugin add`
 * shows up without a restart. Without the agent host's transport there is no host to give, and
 * nothing is provided.
 */
export function providePlugins(
  services: ServiceRegistry,
  parts: {
    readonly ipc: TauriIpc;
    readonly window: object;
    readonly onFocus: (listener: () => void) => () => void;
    readonly onReloadFailed: (error: unknown) => void;
  },
): void {
  const known = hosts.get(parts.window);
  if (known !== undefined) {
    services.provide(PluginsHostService, known.host);
    return;
  }
  const transport = tauriAgentHostTransport(parts.window);
  if (transport === undefined) return;
  const plugins = desktopPluginsHost({
    ipc: parts.ipc,
    secrets: shellKeychain(parts.ipc),
    caller: new AgentHostPluginToolCaller(transport),
    onReloadFailed: parts.onReloadFailed,
  });
  hosts.set(parts.window, plugins);
  const reload = (): void => {
    plugins.reload().catch(parts.onReloadFailed);
  };
  reload();
  parts.onFocus(reload);
  services.provide(PluginsHostService, plugins.host);
}
