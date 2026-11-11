// @vitest-environment jsdom

import { parseFile } from "@halonicjs/format";
import { createShell, defineFeature, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PluginToolCaller } from "./plugin-command-dialog.tsx";
import { PluginCommandHost } from "./plugin-command-host.tsx";
import {
  PluginCommandOpener,
  type PluginCommands,
  pluginCommandSource,
} from "./plugin-command-source.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

/** The Weather plugin's `ui`, parsed by the real `plugin` kind. */
function weather(): PluginCommands {
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
    - id: forecast
      title: Show the forecast
      tool: forecast
      form:
        place: { label: Place, type: text, required: true }`,
  );
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  const plugin = parsed.value.value;
  return { plugin: plugin.id, name: plugin.name, ui: { commands: plugin.ui?.commands ?? [] } };
}

const caller: PluginToolCaller = { call: async () => "Sunny" };

/** A shell whose plugins feature adds the source for the plugins `on` gives now. */
function shellWith(on: () => readonly PluginCommands[]) {
  const opener = new PluginCommandOpener();
  const shell = createShell({
    features: [
      defineFeature({
        id: "plugins",
        title: "Plugins",
        register: (studio) => studio.commands.addSource(pluginCommandSource(on, opener)),
      }),
    ],
  });
  return { commands: shell.contributions.commands, opener };
}

const context = {} as WorkspaceContext;

function dialog(): HTMLDialogElement | null {
  return document.querySelector("dialog[open]");
}

function press(name: string) {
  const found = [...(dialog()?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  act(() => found.click());
}

verifies("plugins.palette-commands", () => {
  it("lists a plugin's commands with its title and source, only while the plugin gives them", () => {
    let plugins = [weather()];
    const { commands } = shellWith(() => plugins);
    expect(commands.list()).toEqual([
      expect.objectContaining({
        id: "plugins.commands.weather.forecast",
        title: "Show the forecast",
        source: "Weather plugin",
        featureId: "plugins",
      }),
    ]);
    plugins = [];
    expect(commands.list()).toEqual([]);
  });

  it("opens the command's dialog when it runs, and closes it on Cancel", async () => {
    const { commands, opener } = shellWith(() => [weather()]);
    render(<PluginCommandHost opener={opener} caller={caller} />);
    expect(dialog()).toBeNull();

    await act(async () => commands.get("plugins.commands.weather.forecast")?.run(context));
    expect(dialog()?.textContent).toContain("Show the forecast");
    expect(dialog()?.textContent).toContain("From the Weather plugin");

    press("Cancel");
    expect(opener.current()).toBeUndefined();
    expect(dialog()).toBeNull();
  });

  it("starts a dialog opened again fresh", async () => {
    const { commands, opener } = shellWith(() => [weather()]);
    render(<PluginCommandHost opener={opener} caller={caller} />);
    const run = async () =>
      await act(async () => commands.get("plugins.commands.weather.forecast")?.run(context));
    await run();
    const first = dialog();
    await run();
    expect(dialog()).not.toBeNull();
    expect(dialog()).not.toBe(first);
  });
});
