// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { serviceKey } from "../service-key.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { type ItemViewProps, itemOfLocationKey } from "./item-view.tsx";
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

/** A service only the _plugins_ feature's context can reach. */
const PanelHeading = serviceKey<string>("plugins.panel-heading");

/** How many times the panel view's module was imported. */
let imports = 0;

/** The panel's view: its `h1` names the item, worded by a service from its feature's context. */
function PanelView({ item, context }: ItemViewProps) {
  return (
    <h1 tabIndex={-1} className="panel-view">
      {`${context.services.get(PanelHeading)} ${item.hub} ${item.id}`}
    </h1>
  );
}

const pluginsFeature = defineFeature({
  id: "plugins",
  title: "Plugins",
  provides: [PanelHeading],
  register(studio) {
    studio.services.provide(PanelHeading, () => "Panel of");
    studio.itemKinds.add({
      kind: "plugin-panel",
      label: "Plugin panel",
      icon: "plugin",
      open: {
        view: "PanelView",
        load: async () => {
          imports += 1;
          return { PanelView };
        },
      },
    });
  },
});

function renderWindow() {
  const shell = createShell({ features: [pluginsFeature], timers: new FakeTimers() });
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
  return { container, workspace };
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.item-tabs", () => {
  it("shows an item's tab with its kind's view, given the item and its feature's context", async () => {
    const { container, workspace } = renderWindow();

    act(() =>
      workspace.tabs.openHere({ key: "plugin-panel/this-computer/weather", title: "Weather" }),
    );
    await settle();

    expect(container.querySelector("main h1.panel-view")?.textContent).toBe(
      "Panel of this-computer weather",
    );
  });

  it("imports a kind's view once, however many of its items are open", async () => {
    imports = 0;
    const { container, workspace } = renderWindow();

    act(() => {
      workspace.tabs.openInNewTab({ key: "plugin-panel/this-computer/weather", title: "Weather" });
      workspace.tabs.openHere({ key: "plugin-panel/this-computer/translate", title: "Translate" });
    });
    await settle();

    expect(container.querySelector("main h1.panel-view")?.textContent).toBe(
      "Panel of this-computer translate",
    );
    expect(imports).toBe(1);
  });

  it("leaves the page empty for an item of a kind no feature added", async () => {
    const { container, workspace } = renderWindow();

    act(() => workspace.tabs.openHere({ key: "agent/acme/sorter", title: "Sorter" }));
    await settle();

    const page = container.querySelector("main [data-tab-page]:not([hidden])");
    expect(page?.textContent).toBe("");
  });

  describe("itemOfLocationKey", () => {
    it("reads the kind, the hub and the id, keeping a / in the id", () => {
      expect(itemOfLocationKey("agent/acme/support/reply")).toEqual({
        kind: "agent",
        hub: "acme",
        id: "support/reply",
      });
    });

    it("gives nothing for Home, a place or a search", () => {
      expect(itemOfLocationKey("home")).toBeUndefined();
      expect(itemOfLocationKey("inbox")).toBeUndefined();
      expect(itemOfLocationKey("agent/acme")).toBeUndefined();
      expect(itemOfLocationKey("/acme/sorter")).toBeUndefined();
    });
  });
});
