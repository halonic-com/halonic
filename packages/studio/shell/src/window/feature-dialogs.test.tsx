// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogHostProps } from "../dialogs/feature-dialogs.tsx";
import { defineFeature, type Feature } from "../feature.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import { serviceKey } from "../service-key.ts";
import { createShell } from "../shell.ts";
import { ShellError } from "../shell-error.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ItemViewProps } from "./item-view.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(DESKTOP_WIDTH);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
  // React logs every error a boundary catches; in the failure test that is the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
  vi.restoreAllMocks();
});

/** A service only the _plugins_ feature's context can reach. */
const PluginsName = serviceKey<string>("plugins.name");

const weather: ItemRef = { kind: "plugin-panel", hub: "this-computer", id: "weather" };
const sorter: ItemRef = { kind: "agent", hub: "acme", id: "sorter" };

/** Draws a button for each item, which opens it with the context's `openItem`. */
function OpenerDialogs({ context }: DialogHostProps) {
  return (
    <section className="plugins-dialogs">
      <p>{`Dialogs of ${context.services.get(PluginsName)}`}</p>
      {[weather, sorter].map((item) => (
        <button
          key={item.id}
          type="button"
          className={`open-${item.id}`}
          onClick={() => context.openItem?.(item)}
        >
          {item.id}
        </button>
      ))}
    </section>
  );
}

function PanelView({ item }: ItemViewProps) {
  return (
    <h1 tabIndex={-1} className="panel-view">
      {`Panel ${item.id}`}
    </h1>
  );
}

const pluginsFeature = defineFeature({
  id: "plugins",
  title: "Plugins",
  provides: [PluginsName],
  register(studio) {
    studio.services.provide(PluginsName, () => "plugins");
    studio.dialogs.add({
      id: "plugins.dialogs",
      order: 10,
      view: "OpenerDialogs",
      load: async () => ({ OpenerDialogs }),
    });
    studio.itemKinds.add({
      kind: "plugin-panel",
      label: "Plugin panel",
      icon: "plugin",
      open: { view: "PanelView", load: async () => ({ PanelView }) },
      tab: {
        describe: (item) => ({ label: item.id === "weather" ? "Weather" : item.id }),
        exists: () => true,
      },
    });
  },
});

function BrokenDialogs(): never {
  throw new Error("The dialogs view broke.");
}

const brokenFeature = defineFeature({
  id: "broken",
  title: "Broken",
  register(studio) {
    studio.dialogs.add({
      id: "broken.dialogs",
      order: 10,
      view: "BrokenDialogs",
      load: async () => ({ BrokenDialogs }),
    });
  },
});

function renderWindow(features: readonly Feature[] = [pluginsFeature]) {
  const shell = createShell({ features, timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="desktop-app"
      platform="windows"
      language="en"
    />,
  );
  const click = (selector: string) =>
    act(() => container.querySelector<HTMLButtonElement>(selector)?.click());
  return { container, workspace, click };
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.feature-dialogs", () => {
  it("draws a feature's dialogs view once, with that feature's context", async () => {
    const { container } = renderWindow();
    await settle();

    const views = container.querySelectorAll(".plugins-dialogs");
    expect(views).toHaveLength(1);
    expect(views[0]?.querySelector("p")?.textContent).toBe("Dialogs of plugins");
  });

  it("draws it on a phone too", async () => {
    media.resize(PHONE_WIDTH);
    const { container } = renderWindow();
    await settle();

    expect(container.querySelector(".plugins-dialogs p")?.textContent).toBe("Dialogs of plugins");
  });

  it("shows nothing for a view that fails, and keeps the others and the page", async () => {
    const { container } = renderWindow([brokenFeature, pluginsFeature]);
    await settle();

    expect(container.querySelector(".plugins-dialogs")).not.toBeNull();
    expect(container.querySelector("main")).not.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("throws a ShellError naming both features when two views share an id", () => {
    const clash = (id: string) =>
      defineFeature({
        id,
        title: id,
        register: (studio) =>
          studio.dialogs.add({ id: "dialogs", order: 10, view: "View", load: async () => ({}) }),
      });

    expect(() => createShell({ features: [clash("plugins"), clash("agents")] })).toThrow(
      ShellError,
    );
    expect(() => createShell({ features: [clash("plugins"), clash("agents")] })).toThrow(
      /plugins[\s\S]*agents|agents[\s\S]*plugins/,
    );
  });
});

verifies("shell.open-item", () => {
  describe("on the desktop", () => {
    it("opens the item in the active tab, named as its kind names its tab", async () => {
      const { container, workspace, click } = renderWindow();
      await settle();

      click("button.open-weather");
      await settle();

      expect(currentLocation(workspace.tabs.active)).toMatchObject({
        key: "plugin-panel/this-computer/weather",
        title: "Weather",
      });
      expect(workspace.tabs.state.tabs).toHaveLength(1);
      expect(container.querySelector("main h1.panel-view")?.textContent).toBe("Panel weather");
    });

    it("goes to the tab that shows the item already, without adding one", async () => {
      const { workspace, click } = renderWindow();
      await settle();
      act(() => {
        workspace.tabs.openHere({ key: "plugin-panel/this-computer/weather", title: "Weather" });
        workspace.tabs.openInNewTab({ key: "home", title: "Home" });
      });
      const panelTab = workspace.tabs.state.tabs[0]?.id;

      click("button.open-weather");

      expect(workspace.tabs.state.tabs).toHaveLength(2);
      expect(workspace.tabs.state.activeId).toBe(panelTab);
    });

    it("names an item of a kind no feature added by its id", async () => {
      const { workspace, click } = renderWindow();
      await settle();

      click("button.open-sorter");

      expect(currentLocation(workspace.tabs.active)).toMatchObject({
        key: "agent/acme/sorter",
        title: "sorter",
      });
    });
  });

  it("opens the item as a page on a phone", async () => {
    media.resize(PHONE_WIDTH);
    const { container, click } = renderWindow();
    await settle();

    click("button.open-weather");
    await settle();

    expect(container.querySelector("header p")?.textContent).toBe("Weather");
    expect(container.querySelector("main h1.panel-view")?.textContent).toBe("Panel weather");
  });
});

verifies("shell.command-source-context", () => {
  it("lists a source's commands from its feature's services when Ctrl K opens", () => {
    const listing = defineFeature({
      id: "plugins",
      title: "Plugins",
      provides: [PluginsName],
      register(studio) {
        studio.services.provide(PluginsName, () => "Show forecast");
        studio.commands.addSource({
          id: "plugins.commands",
          commands: (context) =>
            context === undefined
              ? []
              : [
                  {
                    id: "plugins.commands.weather.forecast",
                    title: context.services.get(PluginsName),
                    run: () => {},
                  },
                ],
        });
      },
    });
    const { container } = renderWindow([listing]);
    const search = [...container.querySelectorAll("button")].find(
      (button) => button.getAttribute("aria-keyshortcuts") === "Control+K",
    );
    act(() => search?.click());
    act(() => {
      const field = container.querySelector<HTMLInputElement>("dialog[open] input");
      if (field === null) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "forecast",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const rows = [...container.querySelectorAll('dialog[open] [role="option"]')];
    expect(rows.map((row) => row.getAttribute("aria-label"))).toContain("Show forecast");
  });
});
