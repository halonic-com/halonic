// @vitest-environment jsdom

import {
  createShell,
  defineFeature,
  type ItemRef,
  type ItemViewProps,
  loadView,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginToolCaller } from "../commands/plugin-command-dialog.tsx";
import { PluginCommandHost } from "../commands/plugin-command-host.tsx";
import { PluginCommandOpener } from "../commands/plugin-command-source.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { feedOf, weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import {
  type PluginPanelFeed,
  pluginPanelCommandSource,
  pluginPanelItem,
  pluginPanelKind,
} from "./plugin-panels.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const caller: PluginToolCaller = { call: async () => "Sunny" };
const context = {} as WorkspaceContext;

/** A shell whose plugins feature adds the panel kind and the panels' command source. */
function shellWith(feed: PluginPanelFeed) {
  const opener = new PluginCommandOpener();
  const opened: ItemRef[] = [];
  const options = { feed, caller, opener, review: vi.fn(), details: vi.fn() };
  const shell = createShell({
    features: [
      defineFeature({
        id: "plugins",
        title: "Plugins",
        register: (studio) => {
          studio.itemKinds.add(pluginPanelKind(() => options));
          studio.commands.addSource(pluginPanelCommandSource(feed, (item) => opened.push(item)));
        },
      }),
    ],
  });
  return { shell, opener, opened };
}

/** Draws the Weather panel the way the shell draws an item's tab. */
async function showPanel(feed: PluginPanelFeed) {
  const { shell, opener } = shellWith(feed);
  const kind = shell.contributions.itemKinds.get("plugin-panel");
  if (kind === undefined) throw new Error("No plugin-panel kind");
  const View = await loadView<ComponentType<ItemViewProps>>(kind.open);
  const view = render(
    <>
      <View item={pluginPanelItem("weather")} context={context} />
      <PluginCommandHost opener={opener} caller={caller} />
    </>,
  );
  await act(async () => {});
  return { view, kind };
}

function button(view: HTMLElement, name: string): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

verifies("plugins.plugin-panel", () => {
  it("shows the panel's title, its source, its commands, its cards and the closing line", async () => {
    const { view } = await showPanel(feedOf([weather()]).feed);

    expect(view.querySelector("h1")?.textContent).toBe("Weather");
    expect(view.textContent).toContain("Plugin panel");
    expect(view.textContent).toContain("From the Weather plugin");
    expect(button(view, "Show the forecast").getAttribute("aria-disabled")).toBeNull();
    expect(view.textContent).toContain("Today's weather");
    expect(view.textContent).toContain("Sunny");
    expect(view.textContent).toContain(
      "Everything on this page comes from the Weather plugin and is drawn by Halonic.",
    );
  });

  it("opens a command's dialog from its button", async () => {
    const { view } = await showPanel(feedOf([weather()]).feed);

    await act(async () => button(view, "Show the forecast").click());

    const dialog = document.querySelector("dialog[open]");
    expect(dialog?.textContent).toContain("Show the forecast");
    expect(dialog?.textContent).toContain("From the Weather plugin");
  });

  it("offers Open Weather panel in Ctrl K while the plugin is on, opening its one tab", () => {
    const { set, feed } = feedOf([weather()]);
    const { shell, opened } = shellWith(feed);
    const { commands } = shell.contributions;

    expect(commands.list()).toEqual([
      expect.objectContaining({
        id: "plugins.panels.weather",
        title: "Open Weather panel",
        source: "Weather plugin",
      }),
    ]);
    commands.get("plugins.panels.weather")?.run(context);
    expect(opened).toEqual([{ kind: "plugin-panel", hub: "this-computer", id: "weather" }]);

    set([weather("not-trusted")]);
    expect(commands.list()).toEqual([]);
  });

  it.each([
    ["not-trusted", "Nothing from this plugin runs until you trust it."],
    ["changed", "It's off until you look at what changed."],
    [
      "cant-load",
      "Weather couldn't load. Its tools, commands and cards are off until its plugin.yaml is fixed.",
    ],
  ] as const)(
    "makes the commands unavailable while the plugin is %s, saying why",
    async (status, line) => {
      const { feed, set } = feedOf([weather()]);
      const { view } = await showPanel(feed);

      set([weather(status)]);

      const command = button(view, "Show the forecast");
      expect(command.getAttribute("aria-disabled")).toBe("true");
      const reason = document.getElementById(command.getAttribute("aria-describedby") ?? "");
      expect(reason?.textContent).toBe(line);
      act(() => command.click());
      expect(document.querySelector("dialog[open]")).toBeNull();
      expect(view.textContent).toContain(
        status === "cant-load"
          ? "Weather couldn't load, so this card is empty."
          : "Weather isn't trusted yet, so this card is empty.",
      );
    },
  );

  it("shows nothing once the plugin is removed, and its kind says the panel is gone", async () => {
    const { feed, set } = feedOf([weather()]);
    const { view, kind } = await showPanel(feed);
    const item = pluginPanelItem("weather");
    expect(kind.tab?.exists(item, context)).toBe(true);
    expect(kind.tab?.describe(item, context).label).toBe("Weather");

    set([]);

    expect(view.querySelector("h1")).toBeNull();
    expect(kind.tab?.exists(item, context)).toBe(false);
  });
});
