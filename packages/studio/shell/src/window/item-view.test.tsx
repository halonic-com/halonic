// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { serviceKey } from "../service-key.ts";
import { createShell } from "../shell.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ItemPageSectionViewProps } from "./item-page-sections.tsx";
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
function PanelView({ item, context, Sections }: ItemViewProps) {
  return (
    <>
      <h1 tabIndex={-1} className="panel-view">
        {`${context.services.get(PanelHeading)} ${item.hub} ${item.id}`}
      </h1>
      <Sections />
    </>
  );
}

/** A section's view: its `p` names the item and the heading only the models feature's context reaches. */
function sectionView(name: string) {
  return function SectionView({ item, context }: ItemPageSectionViewProps) {
    return <p className="section">{`${name} ${item.id} ${context.services.get(ModelsHeading)}`}</p>;
  };
}
const ModelsSection = sectionView("Models");
const UsageSection = sectionView("Usage");

function BrokenSection(): never {
  throw new Error("section broke");
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

/** A service only the _models_ feature's context can reach. */
const ModelsHeading = serviceKey<string>("models.heading");

const modelsFeature = defineFeature({
  id: "models",
  title: "Models",
  provides: [ModelsHeading],
  needs: [PanelHeading],
  register(studio) {
    studio.services.provide(ModelsHeading, () => "models");
    for (const [id, order, view] of [
      ["models", 30, "ModelsSection"],
      ["broken", 20, "BrokenSection"],
      ["usage", 10, "UsageSection"],
    ] as const) {
      studio.itemPage.addSection({
        on: "plugin-panel",
        id,
        order,
        view,
        load: async () => ({ ModelsSection, UsageSection, BrokenSection }),
      });
    }
  },
});

function renderWindow(
  shell = createShell({ features: [pluginsFeature], timers: new FakeTimers() }),
) {
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
  return { container, workspace, shell };
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.item-page-sections", () => {
  async function openPanel(features: Parameters<typeof createShell>[0]["features"]) {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const shell = createShell({ features, timers: new FakeTimers() });
    const opened = renderWindow(shell);
    act(() =>
      opened.workspace.tabs.openHere({
        key: "plugin-panel/this-computer/weather",
        title: "Weather",
      }),
    );
    await settle();
    return opened.container;
  }

  it("draws the sections other features add where the page places them, in order, with their own feature's context", async () => {
    const container = await openPanel([pluginsFeature, modelsFeature]);

    const sections = [...container.querySelectorAll("main p.section")];
    expect(sections.map((section) => section.textContent)).toEqual([
      "Usage weather models",
      "Models weather models",
    ]);
  });

  it("leaves the page and the other sections up when one section fails", async () => {
    const container = await openPanel([pluginsFeature, modelsFeature]);

    expect(console.error).toHaveBeenCalled();
    expect(container.querySelector("main h1.panel-view")).not.toBeNull();
    expect(container.querySelectorAll("main p.section")).toHaveLength(2);
  });
});

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

  it("imports a kind's view once, however often its items are opened and mounted", async () => {
    imports = 0;
    const { workspace, shell } = renderWindow();
    act(() => {
      workspace.tabs.openInNewTab({ key: "plugin-panel/this-computer/weather", title: "Weather" });
      workspace.tabs.openHere({ key: "plugin-panel/this-computer/translate", title: "Translate" });
    });
    await settle();
    unmountAll();

    const again = renderWindow(shell);
    act(() =>
      again.workspace.tabs.openHere({
        key: "plugin-panel/this-computer/weather",
        title: "Weather",
      }),
    );

    expect(again.container.querySelector("main h1.panel-view")?.textContent).toBe(
      "Panel of this-computer weather",
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
      expect(itemOfLocationKey("agent//sorter")).toBeUndefined();
    });
  });
});
