// @vitest-environment jsdom

import { parseFile } from "@halonicjs/format";
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
import { afterEach, expect, it } from "vitest";
import type { PluginCardStatus } from "../cards/plugin-card.tsx";
import { feedOf, noSettings, weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PluginPage } from "./plugin-page.tsx";
import {
  type InstalledPlugin,
  type InstalledPluginFeed,
  pluginPageItem,
  pluginPageKind,
} from "./plugin-pages.ts";

afterEach(unmountAll);

const now = () => new Date(2026, 10, 12);

/** The Weather plugin with the setting "City" and `description`, standing where the test says. */
function withCity(
  status: PluginCardStatus,
  description = "The forecast where you are.",
): InstalledPlugin {
  const parsed = parseFile(
    "plugin",
    `id: weather
version: 1.2.0
sdk: 1
name: Weather
description: ${JSON.stringify(description)}
backend:
  hosts: [api.example.com]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
ui:
  settings:
    city: { label: City, type: text }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return { ...weather(status), manifest: parsed.value.value, panel: undefined };
}

/** A plugin that can't load: core gives its folder's name and its problems, with no manifest. */
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

async function showPage(plugin: InstalledPlugin, onOpenPanel = () => {}) {
  const view = render(
    <PluginPage plugin={plugin} {...noSettings()} onOpenPanel={onOpenPanel} now={now} />,
  );
  await act(async () => {});
  return view;
}

/** Draws the page of `plugin/this-computer/weather` the way the shell draws an item's tab. */
async function showItem(feed: InstalledPluginFeed) {
  const opened: string[] = [];
  const options = { feed, ...noSettings(), openPanel: (plugin: string) => opened.push(plugin) };
  const shell = createShell({
    features: [
      defineFeature({
        id: "plugins",
        title: "Plugins",
        register: (studio) => studio.itemKinds.add(pluginPageKind(() => options)),
      }),
    ],
  });
  const kind = shell.contributions.itemKinds.get("plugin");
  if (kind === undefined) throw new Error("No plugin kind");
  const View = await loadView<ComponentType<ItemViewProps>>(kind.open);
  const context = {} as WorkspaceContext;
  const view = render(<View item={pluginPageItem("weather")} context={context} />);
  await act(async () => {});
  return { view, kind, context, opened };
}

function button(view: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...view.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === name,
  );
}

verifies("plugins.plugin-page", () => {
  it("shows the heading, Open panel and the On status of a plugin that's on", async () => {
    const view = await showPage(weather());

    expect(view.querySelector("h1")?.textContent).toBe("PluginWeather");
    expect(view.querySelector("h1 input")).toBeNull();
    expect(button(view, "Open panel")).toBeDefined();
    expect(view.textContent).toContain("On");
    expect(view.textContent).toContain(
      "Trusted on 3 Nov · version 1.2.0 · from github.com/example/halonic-weather",
    );
  });

  it("opens the panel's item from Open panel, through the kind's view", async () => {
    const { feed } = feedOf([weather()]);
    const { view, opened } = await showItem(feed);

    act(() => button(view, "Open panel")?.click());

    expect(opened).toEqual(["weather"]);
  });

  it("has no Open panel for a plugin without a panel", async () => {
    const view = await showPage(withCity("on"));

    expect(button(view, "Open panel")).toBeUndefined();
  });

  it("lists what the plugin adds, with the tool's risk and description", async () => {
    const view = await showPage(weather());
    const adds = [...view.querySelectorAll("section")].find(
      (section) => section.querySelector("h2")?.textContent === "What it adds",
    );

    expect(adds?.querySelector("code")?.textContent).toBe("forecast");
    expect(adds?.textContent).toContain("Reads");
    expect(adds?.textContent).toContain("“The forecast.”");
    expect(adds?.textContent).toContain("Give them to an agent with a connector.");
    expect(adds?.textContent).toContain("Show the forecast · in Ctrl K");
    expect(adds?.textContent).toContain("Today's weather · on Home");
    expect(adds?.textContent).toContain("Weather · opens in a tab");
  });

  it("says a plugin isn't trusted yet, and makes its settings unavailable", async () => {
    const view = await showPage(withCity("not-trusted"));

    expect(view.textContent).toContain("Not trusted yet");
    expect(view.textContent).toContain("Nothing from this plugin runs until you trust it.");
    const city = view.querySelector("input");
    expect(city?.readOnly).toBe(true);
    expect(city?.getAttribute("aria-disabled")).toBe("true");
  });

  it("says when a plugin changed since it was trusted", async () => {
    const view = await showPage(withCity("changed"));

    expect(view.textContent).toContain("Changed since you trusted it on 3 Nov");
    expect(view.textContent).toContain("It's off until you look at what changed.");
  });

  it("shows a plugin that can't load, with each problem's place in mono", async () => {
    const view = await showPage(broken);

    expect(view.textContent).toContain("weather couldn't load.");
    expect(view.textContent).toContain(
      "Its tools, commands and cards are off until its plugin.yaml is fixed.",
    );
    expect(view.querySelector(".font-mono")?.textContent).toBe("plugin.yaml ui.commands.0.tool");
    expect(view.textContent).toContain("uses the tool send_email, which sends.");
    expect(view.textContent).not.toContain("What it adds");
  });

  it("shows the plugin's description as plain text in quotes", async () => {
    const view = await showPage(withCity("on", "<b>Hi</b> [x](javascript:alert(1))"));

    expect(view.textContent).toContain("“<b>Hi</b> [x](javascript:alert(1))”");
    expect(view.querySelector("b")).toBeNull();
    expect(view.querySelector("a")).toBeNull();
  });

  it("is named by the plugin and shows nothing once it's removed", async () => {
    const { feed, set } = feedOf<InstalledPlugin>([weather()]);
    const { view, kind, context } = await showItem(feed);
    const item: ItemRef = pluginPageItem("weather");
    expect(kind.tab?.describe?.(item, context)).toEqual({ label: "Weather" });
    expect(kind.tab?.exists?.(item, context)).toBe(true);

    await set([]);

    expect(view.textContent).toBe("");
    expect(kind.tab?.exists?.(item, context)).toBe(false);
  });

  it("follows the plugin when it's trusted while the page shows", async () => {
    const { feed, set } = feedOf<InstalledPlugin>([withCity("not-trusted")]);
    const { view } = await showItem(feed);
    expect(view.textContent).toContain("Not trusted yet");

    await set([withCity("on")]);

    expect(view.textContent).not.toContain("Not trusted yet");
    expect(view.textContent).toContain("Trusted on 3 Nov");
  });
});
