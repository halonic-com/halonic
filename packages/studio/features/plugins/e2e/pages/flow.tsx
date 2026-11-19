import { createToastStore, ToastRegion, ToastStoreProvider } from "@halonicjs/studio-kit";
import {
  createAnnouncer,
  type ServiceKey,
  type SettingsSectionProps,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import type { PluginInstaller } from "../../src/add/plugin-installer.ts";
import { PluginsService } from "../../src/api.ts";
import { PluginCommandHost } from "../../src/commands/plugin-command-host.tsx";
import { pluginCommandSource } from "../../src/commands/plugin-command-source.ts";
import { PluginsSettingsSection } from "../../src/list/plugins-settings-section.tsx";
import type { PluginActions } from "../../src/page/plugin-actions.ts";
import type { InstalledPlugin } from "../../src/page/plugin-pages.ts";
import { type PluginsHost, studioPlugins } from "../../src/plugins-service.ts";
import { weather } from "../../src/test-support/plugins.ts";

/**
 * The plugins feature's real views over an in-memory host (HAL-1740): Settings › Plugins with its
 * Add plugin dialog, the trust check, the command dialog and the Remove plugin dialog. What the
 * app does on the computer (copy a folder, save trust, delete) is a fake that keeps the installed
 * plugins in a list, so the feed changes as it would. The words and the views are the feature's.
 * The "Commands" box stands in for Ctrl K, which is the shell's.
 */
let installed: readonly InstalledPlugin[] = [];
const listeners = new Set<() => void>();
const change = (next: readonly InstalledPlugin[]) => {
  installed = next;
  for (const listener of listeners) listener();
};
const feed = {
  current: () => installed,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const installer: PluginInstaller = {
  add: async (source) => {
    if (source.kind !== "folder") return { kind: "no-manifest" };
    change([...installed, weather("not-trusted")]);
    return { kind: "added", plugin: "weather" };
  },
};

const actions: PluginActions = {
  trust: async (plugin) =>
    change(
      installed.map((one) =>
        one.plugin === plugin ? { ...weather("on"), plugin: one.plugin } : one,
      ),
    ),
  revoke: async () => {},
  remove: async (plugin) => {
    change(installed.filter((one) => one.plugin !== plugin));
    return { kind: "removed" };
  },
  checkForUpdate: async () => ({ kind: "up-to-date" }),
  applyUpdate: async () => {},
  reload: async () => {},
  openFolder: async () => {},
  usedBy: async () => [],
};

const host: PluginsHost = {
  feed,
  caller: { call: async () => "Sunny, 18 degrees in Ghent." },
  settings: {
    settings: async () => ({}),
    saveSettings: async () => ({ ok: true }),
    secretNames: () => ({}),
    forget: async () => {},
  },
  secrets: { has: async () => false, set: async () => {}, remove: async () => {} },
  actions,
  installer,
  builtIn: [],
};
const plugins = studioPlugins(host);

const context: WorkspaceContext = {
  services: {
    get: <Service,>(key: ServiceKey<Service>) => {
      if (key.name !== PluginsService.name) throw new Error(`The page has no ${key.name}.`);
      return plugins as Service;
    },
    find: <Service,>(key: ServiceKey<Service>) =>
      key.name === PluginsService.name ? (plugins as Service) : undefined,
  },
  announcer: createAnnouncer(),
};

const source = pluginCommandSource(
  () =>
    installed
      .filter((plugin) => plugin.status === "on" && plugin.manifest?.ui !== undefined)
      .map((plugin) => ({
        plugin: plugin.plugin,
        name: plugin.name,
        ui: { commands: plugin.commands },
      })),
  plugins.opener,
);

/** Ctrl K's list of plugin commands, as buttons. */
function Commands() {
  useSyncExternalStore(feed.subscribe, feed.current);
  return (
    <section aria-label="Commands" className="flex flex-col gap-2">
      <h2 className="text-body-strong">Commands</h2>
      {source.commands().map((command) => (
        <button
          key={command.id}
          type="button"
          className="w-fit rounded-md border border-border px-3 py-1"
          onClick={() => command.run({} as never)}
        >
          {command.title}
        </button>
      ))}
    </section>
  );
}

const toasts = createToastStore();
const props: SettingsSectionProps = {
  context,
  closeSettings: () => undefined,
  place: "app",
  surface: "window",
};

const root = document.getElementById("root");
if (root === null) throw new Error("The plugins flow page needs its #root element (flow.html).");
createRoot(root).render(
  <StrictMode>
    <ToastStoreProvider store={toasts}>
      <div className="relative min-h-screen bg-surface p-6 text-fg">
        <main className="mx-auto flex max-w-3xl flex-col gap-6">
          <h1 className="text-title">Plugins</h1>
          <PluginsSettingsSection {...props} />
          <Commands />
        </main>
        <ToastRegion store={toasts} />
      </div>
      <PluginCommandHost opener={plugins.opener} caller={plugins.caller} />
    </ToastStoreProvider>
  </StrictMode>,
);
