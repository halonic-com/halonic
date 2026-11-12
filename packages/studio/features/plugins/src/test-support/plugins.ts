import { parseFile } from "@halonicjs/format";
import type { ServiceKey, ServiceTarget } from "@halonicjs/studio-shell";
import { act } from "react";
import type { PluginCardStatus } from "../cards/plugin-card.tsx";
import type { InstalledPlugin } from "../page/plugin-pages.ts";
import type { PluginPanelFeed, PluginPanelUi } from "../panel/plugin-panels.ts";
import type {
  PluginSecretStore,
  PluginSettingsReader,
} from "../settings/plugin-settings-section.tsx";

/** The Weather plugin, parsed by the real `plugin` kind, standing where the test says. */
export function weather(status: PluginCardStatus = "on"): InstalledPlugin {
  const parsed = parseFile(
    "plugin",
    `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.example.com]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
ui:
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
  cards:
    - { id: today, title: Today's weather, tool: forecast, args: { place: Ghent } }
  panel: { title: Weather }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  const manifest = parsed.value.value;
  const { id, name, ui } = manifest;
  return {
    plugin: id,
    name,
    status,
    commands: ui?.commands ?? [],
    cards: ui?.cards ?? [],
    panel: ui?.panel,
    manifest,
    trustedAt: status === "not-trusted" ? undefined : "2026-11-03T09:00:00.000Z",
    origin: {
      kind: "git",
      address: "https://github.com/example/halonic-weather.git",
      commit: "3f9c2a1",
    },
    problems: [],
  };
}

/** A feed the test changes while the panel or the page shows. */
export function feedOf<Plugin extends PluginPanelUi>(initial: readonly Plugin[]) {
  let plugins = initial;
  const listeners = new Set<() => void>();
  const feed = {
    current: () => plugins,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } satisfies PluginPanelFeed;
  const set = (next: readonly Plugin[]) =>
    act(() => {
      plugins = next;
      for (const listener of listeners) listener();
    });
  return { feed, set };
}

/** A minimal workspace registry; the Studio uses `ServiceRegistry` from `@halonicjs/app`. */
export class WorkspaceServices implements ServiceTarget {
  readonly #services = new Map<string, unknown>();
  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.#services.set(key.name, service);
  }
  get<Service>(key: ServiceKey<Service>): Service {
    return this.#services.get(key.name) as Service;
  }
  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.name);
  }
}

/** Settings and a keychain that hold nothing: for tests that don't look at settings. */
export function noSettings(): { settings: PluginSettingsReader; secrets: PluginSecretStore } {
  return {
    settings: {
      settings: async () => ({}),
      saveSettings: async () => ({ ok: true }),
      secretNames: () => ({}),
      forget: async () => {},
    },
    secrets: { get: async () => null, set: async () => {}, remove: async () => {} },
  };
}
