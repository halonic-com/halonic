// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { activeItemOf } from "./active-item.ts";
import { PageItems } from "./page-items.ts";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

const runs = { key: "runs", title: "Runs" };
const agents = { key: "agents", title: "Agents" };
const r1 = { kind: "run", hub: "acme", id: "r1" } as const;

/** A tab set on Runs, its page items and the `activeItem` that reads both. */
function onRuns() {
  const tabs = new TabSet();
  tabs.openHere(runs);
  const pageItems = new PageItems(tabs);
  const source = activeItemOf(tabs, pageItems);
  const heard = { count: 0 };
  source.subscribe(() => {
    heard.count += 1;
  });
  const runsTab = tabs.state.activeId;
  return { tabs, pageItems, source, heard, runsTab };
}

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

verifies("shell.page-item", () => {
  it("gives the item a place's page set as activeItem, and tells a listener", () => {
    const { pageItems, source, heard, runsTab } = onRuns();

    pageItems.set(runsTab, runs.key, r1);

    expect(source.get()).toEqual(r1);
    expect(heard.count).toBe(1);
  });

  it("drops it once the tab opens another place, and Back doesn't bring it back", () => {
    const { tabs, pageItems, source, runsTab } = onRuns();
    pageItems.set(runsTab, runs.key, r1);

    tabs.openHere(agents);
    expect(source.get()).toBeNull();
    tabs.back();

    expect(source.get()).toBeNull();
  });

  it("is null while another tab is active, and back when the Runs tab is", () => {
    const { tabs, pageItems, source, heard, runsTab } = onRuns();
    pageItems.set(runsTab, runs.key, r1);

    tabs.newTab();
    expect(source.get()).toBeNull();
    tabs.activate(runsTab);

    expect(source.get()).toEqual(r1);
    expect(heard.count).toBe(3);
  });

  it("is null after the page clears it, and tells a listener", () => {
    const { pageItems, source, heard, runsTab } = onRuns();
    pageItems.set(runsTab, runs.key, r1);

    pageItems.set(runsTab, runs.key, null);

    expect(source.get()).toBeNull();
    expect(heard.count).toBe(2);
  });

  it("keeps no item for a tab that closed or left the place", () => {
    const { tabs, pageItems, runsTab } = onRuns();
    pageItems.set(runsTab, runs.key, r1);
    tabs.close(runsTab);
    expect(pageItems.of(runsTab)).toBeUndefined();

    tabs.openHere(runs);
    const reopened = tabs.state.activeId;
    pageItems.set(reopened, runs.key, r1);
    tabs.openHere(agents);

    expect(pageItems.of(reopened)).toBeUndefined();
  });

  it("keeps the new item when a place the tab left clears late", () => {
    const { tabs, pageItems, source, runsTab } = onRuns();

    tabs.openHere(agents);
    pageItems.set(runsTab, agents.key, r1);
    pageItems.set(runsTab, runs.key, null);

    expect(source.get()).toEqual(r1);
  });

  it("reaches a place's view in a desktop tab, whose clear the status bar hears", async () => {
    const seen: { context?: WorkspaceContext } = {};
    function RunsView({ context }: { context: WorkspaceContext }) {
      const { setPageItem } = context;
      const [open, setOpen] = useState(true);
      useEffect(() => setPageItem?.(open ? r1 : null), [open, setPageItem]);
      return (
        <button type="button" onClick={() => setOpen(false)}>
          {"Close the run"}
        </button>
      );
    }
    const feature = defineFeature({
      id: "runs",
      title: "Runs",
      register(studio) {
        studio.places.add({ id: "runs", view: "RunsView", load: async () => ({ RunsView }) });
        studio.statusBar.add({
          id: "item",
          order: 10,
          view: "Item",
          load: async () => ({
            Item: ({ context }: { context: WorkspaceContext }) => {
              seen.context = context;
              return null;
            },
          }),
        });
      },
    });
    const shell = createShell({ features: [feature], timers: new FakeTimers() });
    const services = new MapTarget();
    shell.services.instantiate(services);
    const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
    const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
    render(
      <StudioWindow
        shell={shell}
        workspace={workspace}
        host="desktop-app"
        platform="windows"
        language="en"
      />,
    );
    await settle();
    act(() => workspace.tabs.openHere(runs));
    await settle();

    expect(seen.context?.activeItem?.get()).toEqual(r1);
    expect(seen.context?.setPageItem).toBeUndefined();
    expect(seen.context?.shown?.()).toEqual({ place: "runs" });
    const heard = { count: 0 };
    seen.context?.activeItem?.subscribe(() => {
      heard.count += 1;
    });
    const close = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Close the run",
    );
    act(() => close?.click());

    expect(seen.context?.activeItem?.get()).toBeNull();
    expect(heard.count).toBe(1);
  });
});
