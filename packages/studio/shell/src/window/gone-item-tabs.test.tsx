// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1280).install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
});

/** The installed plugins with a panel, as a test changes them, and who listens. */
function pluginList(...plugins: string[]) {
  let installed = new Set(plugins);
  const listeners = new Set<() => void>();
  return {
    has: (plugin: string) => installed.has(plugin),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(...now: string[]) {
      installed = new Set(now);
      for (const listener of listeners) listener();
    },
    listening: () => listeners.size,
  };
}

/** A window whose _plugins_ feature adds the `plugin-panel` kind, its tabs told by `plugins`. */
function renderWindow(plugins: ReturnType<typeof pluginList>) {
  const feature = defineFeature({
    id: "plugins",
    title: "Plugins",
    register(studio) {
      studio.itemKinds.add({
        kind: "plugin-panel",
        label: "Plugin panel",
        icon: "plugin",
        open: { view: "PanelView", load: async () => ({ PanelView: () => null }) },
        tab: {
          describe: (item) => ({ label: item.id }),
          exists: (item) => plugins.has(item.id),
          subscribe: (listener) => plugins.subscribe(listener),
        },
      });
    },
  });
  const shell = createShell({ features: [feature], timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  return workspace.tabs;
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const weather = { key: "plugin-panel/this-computer/weather", title: "Weather" };
const translate = { key: "plugin-panel/this-computer/translate", title: "Translate" };

verifies("shell.gone-item-tabs", () => {
  it("closes the tab of a removed plugin's panel as Ctrl W does, and leaves the others open", async () => {
    const plugins = pluginList("weather", "translate");
    const tabs = renderWindow(plugins);
    act(() => {
      tabs.openHere({ key: "agents", title: "Agents" });
      tabs.openInNewTab(weather);
      tabs.activateAt(1);
      tabs.openInNewTab(translate);
    });
    await settle();

    act(() => plugins.set("translate"));

    expect(tabs.state.tabs.map((tab) => currentLocation(tab).title)).toEqual([
      "Agents",
      "Translate",
    ]);
    expect(currentLocation(tabs.active).title).toBe("Translate");
    act(() => tabs.reopenClosed());
    expect(currentLocation(tabs.active).title).toBe("Weather");
  });

  it("keeps a tab that shows the gone item only further back in its history", async () => {
    const plugins = pluginList("weather");
    const tabs = renderWindow(plugins);
    act(() => {
      tabs.openHere(weather);
      tabs.openHere({ key: "agents", title: "Agents" });
    });
    await settle();

    act(() => plugins.set());

    expect(tabs.state.tabs.map((tab) => currentLocation(tab).title)).toEqual(["Agents"]);
    expect(tabs.state.canGoBack).toBe(true);
  });

  it("stops listening when the window goes", () => {
    const plugins = pluginList("weather");
    renderWindow(plugins);
    expect(plugins.listening()).toBe(1);

    unmountAll();

    expect(plugins.listening()).toBe(0);
  });
});
