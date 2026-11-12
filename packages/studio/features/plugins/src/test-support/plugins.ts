import { parseFile } from "@halonicjs/format";
import type { ServiceKey, ServiceTarget } from "@halonicjs/studio-shell";
import { act } from "react";
import type { PluginCardStatus } from "../cards/plugin-card.tsx";
import type { PluginPanelFeed, PluginPanelUi } from "../panel/plugin-panels.ts";

/** The Weather plugin, parsed by the real `plugin` kind, standing where the test says. */
export function weather(status: PluginCardStatus = "on"): PluginPanelUi {
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
  const { id, name, ui } = parsed.value.value;
  return {
    plugin: id,
    name,
    status,
    commands: ui?.commands ?? [],
    cards: ui?.cards ?? [],
    panel: ui?.panel,
  };
}

/** A feed the test changes while the panel shows. */
export function feedOf(initial: readonly PluginPanelUi[]) {
  let plugins = initial;
  const listeners = new Set<() => void>();
  const feed: PluginPanelFeed = {
    current: () => plugins,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const set = (next: readonly PluginPanelUi[]) =>
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
