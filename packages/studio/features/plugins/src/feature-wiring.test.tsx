// @vitest-environment jsdom

import {
  createShell,
  type DialogHostProps,
  type HomeCardProps,
  type ItemRef,
  loadView,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PluginsHostService, PluginsService } from "./api.ts";
import { pluginsFeature } from "./feature.ts";
import type { InstalledPlugin } from "./page/plugin-pages.ts";
import { fakeModal, restoreModal } from "./test-support/modal.ts";
import { feedOf, noSettings, WorkspaceServices, weather } from "./test-support/plugins.ts";
import { render, unmountAll } from "./test-support/render.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

/** A Studio with the plugins feature over `plugins`, and a window's context for it. */
function studioWith(plugins: readonly InstalledPlugin[]) {
  const { feed, set } = feedOf(plugins);
  const call = vi.fn(async () => "Sunny");
  const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
  const workspace = new WorkspaceServices();
  workspace.provide(PluginsHostService, { feed, caller: { call }, ...noSettings() });
  shell.services.instantiate(workspace);
  const opened: ItemRef[] = [];
  const context: WorkspaceContext = {
    ...shell.services.contextFor("plugins", workspace),
    openItem: (item) => opened.push(item),
  };
  const contextFor = () => context;
  return { shell, workspace, context, contextFor, opened, set, call };
}

verifies("plugins.feature", () => {
  it("lists the commands and the panel of a plugin that's on, with its source", () => {
    const { shell, contextFor } = studioWith([weather()]);

    expect(shell.contributions.commands.list(contextFor)).toEqual([
      expect.objectContaining({
        id: "plugins.commands.weather.forecast",
        title: "Show the forecast",
        source: "Weather plugin",
      }),
      expect.objectContaining({
        id: "plugins.panels.weather",
        title: "Open Weather panel",
        source: "Weather plugin",
      }),
    ]);
    expect(shell.contributions.commands.list()).toEqual([]);
  });

  it("opens a command's dialog in the window when the command runs", async () => {
    const { shell, context, contextFor } = studioWith([weather()]);
    const [host] = shell.contributions.dialogs.list();
    if (host === undefined) throw new Error("No dialogs view");
    const Dialogs = await loadView<ComponentType<DialogHostProps>>(host);
    const view = render(<Dialogs context={context} />);
    expect(view.querySelector("dialog[open]")).toBeNull();

    await act(async () =>
      shell.contributions.commands
        .get("plugins.commands.weather.forecast", contextFor)
        ?.run(context),
    );

    expect(document.querySelector("dialog[open]")?.textContent).toContain("Show the forecast");
  });

  it("opens the panel's item, so the shell keeps one tab per plugin", () => {
    const { shell, context, contextFor, opened } = studioWith([weather()]);

    shell.contributions.commands.get("plugins.panels.weather", contextFor)?.run(context);

    expect(opened).toEqual([{ kind: "plugin-panel", hub: "this-computer", id: "weather" }]);
    const kind = shell.contributions.itemKinds.get("plugin-panel");
    expect(kind?.tab?.describe(opened[0] as ItemRef, context).label).toBe("Weather");
  });

  it("gives no commands for a plugin that isn't on, and Review opens its page", async () => {
    const { shell, context, contextFor, opened } = studioWith([weather("not-trusted")]);

    expect(shell.contributions.commands.list(contextFor)).toEqual([]);

    const [cards] = shell.contributions.home.cards();
    if (cards === undefined) throw new Error("No Cards section");
    const Cards = await loadView<ComponentType<HomeCardProps>>(cards);
    const view = render(<Cards context={context} />);
    const review = [...view.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Review",
    );
    act(() => review?.click());

    expect(opened).toEqual([{ kind: "plugin", hub: "this-computer", id: "weather" }]);
  });

  it("calls a plugin's tools through the app's caller, with the 30-second limit", async () => {
    const { workspace, call } = studioWith([weather()]);
    const { caller } = workspace.get(PluginsService);

    expect(await caller.call("weather", "forecast", {})).toBe("Sunny");
    expect(call).toHaveBeenCalledWith("weather", "forecast", {});

    vi.useFakeTimers();
    try {
      call.mockImplementationOnce(() => new Promise<string>(() => {}));
      const silent = caller.call("weather", "forecast", {});
      const failed = expect(silent).rejects.toThrow("the plugin didn't answer in 30 seconds");
      await vi.advanceTimersByTimeAsync(30_000);
      await failed;
    } finally {
      vi.useRealTimers();
    }
  });
});
