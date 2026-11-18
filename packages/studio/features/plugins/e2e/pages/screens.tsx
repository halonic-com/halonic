import {
  createToastStore,
  PresentationProvider,
  ToastRegion,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PluginCard, type PluginCardStatus } from "../../src/cards/plugin-card.tsx";
import { PluginPage } from "../../src/page/plugin-page.tsx";
import type { InstalledPlugin } from "../../src/page/plugin-pages.ts";
import { PluginPanel } from "../../src/panel/plugin-panel.tsx";
import { noActions, noSettings, weather } from "../../src/test-support/plugins.ts";

/**
 * The plugin screens the flow page doesn't reach, for the CI screenshots (HAL-1740, T16): the
 * plugin's page on, not trusted yet and can't load, its panel, and its cards on Home in each
 * state. `?screen=` picks one. The views are the feature's; the data is made up.
 */
const caller = {
  call: async (_plugin: string, _tool: string, args: Readonly<Record<string, unknown>>) => {
    if (args["place"] === "Nowhere") throw new Error("the plugin's server didn't answer");
    return "Sunny, 18 degrees in Ghent.";
  },
};

/** A plugin that can't load: its folder's name and its problems, with no manifest. */
const broken: InstalledPlugin = {
  plugin: "weather",
  name: "weather",
  status: "cant-load",
  commands: [],
  cards: [],
  problems: [
    {
      file: "plugin.yaml",
      path: ["ui", "commands", 0, "tool"],
      message:
        "The command Send report uses the tool send_email, which sends. Commands and cards can only use tools that read.",
    },
  ],
};

const now = () => new Date(2026, 10, 12);

function page(plugin: InstalledPlugin): ReactNode {
  return (
    <PluginPage
      plugin={plugin}
      {...noSettings()}
      {...noActions()}
      onOpenPanel={() => undefined}
      now={now}
    />
  );
}

function card(status: PluginCardStatus, place = "Ghent"): ReactNode {
  const today = weather().cards[0];
  if (today === undefined) throw new Error("The Weather plugin has no card.");
  return (
    <PluginCard
      plugin={{ id: "weather", name: "Weather" }}
      status={status}
      card={{ ...today, args: { place } }}
      caller={caller}
      onReview={() => undefined}
      onDetails={() => undefined}
      onHide={() => undefined}
    />
  );
}

function cards(): ReactNode {
  return (
    <section aria-label="Cards" className="grid grid-cols-2 gap-4">
      {card("on")}
      {card("not-trusted")}
      {card("cant-load")}
      {card("on", "Nowhere")}
    </section>
  );
}

function panel(): ReactNode {
  const on = weather("on");
  return (
    <PluginPanel
      plugin={{ id: on.plugin, name: on.name }}
      status="on"
      title={on.panel?.title ?? on.name}
      commands={on.commands}
      cards={on.cards}
      caller={caller}
      onCommand={() => undefined}
      onReview={() => undefined}
      onDetails={() => undefined}
    />
  );
}

const screens: Readonly<Record<string, () => ReactNode>> = {
  "page-on": () => page(weather("on")),
  "page-not-trusted": () => page(weather("not-trusted")),
  "page-cant-load": () => page(broken),
  panel,
  cards,
};

const screen = screens[new URLSearchParams(location.search).get("screen") ?? ""];
if (screen === undefined) throw new Error("Pick a screen with ?screen= (screens.tsx).");
const root = document.getElementById("root");
if (root === null) throw new Error("The plugin screens page needs its #root element.");
const toasts = createToastStore();
createRoot(root).render(
  <StrictMode>
    <PresentationProvider presentation="desktop">
      <ToastStoreProvider store={toasts}>
        <div className="relative min-h-screen bg-bg p-6 text-fg">
          <main className="mx-auto flex max-w-3xl flex-col gap-6">{screen()}</main>
          <ToastRegion store={toasts} />
        </div>
      </ToastStoreProvider>
    </PresentationProvider>
  </StrictMode>,
);
