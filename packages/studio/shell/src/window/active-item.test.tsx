// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { createShell } from "../shell.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ActiveItemSource, WorkspaceContext } from "../workspace-context.ts";
import { activeItemOf } from "./active-item.ts";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

const r1 = { key: "run/acme/r1", title: "Run r1" };
const r2 = { key: "run/acme/r2", title: "Run r2" };
const agents = { key: "agents", title: "Agents" };

/** Counts how often a source's listener ran. */
function listen(source: ActiveItemSource) {
  const heard = { count: 0 };
  const stop = source.subscribe(() => {
    heard.count += 1;
  });
  return { heard, stop };
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

verifies("shell.active-item", () => {
  it("is null while only Home is open, and a switch between tabs on Home says nothing", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    const { heard } = listen(source);

    tabs.newTab();
    tabs.activateAt(0);

    expect(source.get()).toBeNull();
    expect(heard.count).toBe(0);
  });

  it("follows a switch between a tab on Home and a tab on a run", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    const { heard } = listen(source);
    tabs.openInNewTab(r1);

    tabs.activateAt(1);
    expect(source.get()).toEqual({ kind: "run", hub: "acme", id: "r1" });
    tabs.activateAt(0);

    expect(source.get()).toBeNull();
    expect(heard.count).toBe(2);
  });

  it("says nothing when another tab shows the same item or the tab is renamed", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    tabs.openHere(r1);
    const { heard } = listen(source);

    tabs.rename(r1.key, "Run one");
    tabs.openHere(r1);

    expect(heard.count).toBe(0);
  });

  it("moves to the neighbour when the focused tab closes, and says so", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    tabs.openHere(r1);
    tabs.openInNewTab(agents);
    const { heard } = listen(source);

    tabs.close(tabs.state.activeId);

    expect(source.get()).toBeNull();
    expect(heard.count).toBe(1);
  });

  it("is null after the last tab closes, and after history moves to a place", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    tabs.openHere(r1);
    tabs.openHere(r2);
    tabs.back();
    expect(source.get()).toEqual({ kind: "run", hub: "acme", id: "r1" });
    tabs.close(tabs.state.activeId);

    expect(source.get()).toBeNull();
  });

  it("stops telling a listener once it unsubscribes", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    const { heard, stop } = listen(source);
    stop();

    tabs.openHere(r1);

    expect(heard.count).toBe(0);
  });

  it("gives the same reference until the item changes", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    tabs.openHere(r1);
    const first = source.get();

    expect(source.get()).toBe(first);
    tabs.rename(r1.key, "Run one");
    expect(source.get()).toBe(first);
    tabs.openHere(r2);
    expect(source.get()).not.toBe(first);
    expect(source.get()).toBe(source.get());
  });

  it("can be read with useSyncExternalStore", () => {
    const tabs = new TabSet();
    const source = activeItemOf(tabs);
    const shown: (string | null)[] = [];
    function Reader() {
      const item = useSyncExternalStore(source.subscribe, source.get);
      shown.push(item?.id ?? null);
      return null;
    }
    render(<Reader />);

    act(() => tabs.openHere(r1));
    act(() => tabs.openHere(r2));

    expect(shown.at(-1)).toBe("r2");
    expect(shown).toEqual([null, "r1", "r2"]);
  });

  it("reaches a feature's status bar item through its context", async () => {
    const seen: (ActiveItemSource | undefined)[] = [];
    const feature = defineFeature({
      id: "spend",
      title: "Spend",
      register(studio) {
        studio.statusBar.add({
          id: "item",
          order: 10,
          view: "Item",
          load: async () => ({
            Item: ({ context }: { context: WorkspaceContext }) => {
              seen.push(context.activeItem);
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
    render(
      <StudioWindow
        shell={shell}
        workspace={workspace}
        host="desktop-app"
        platform="windows"
        language="en"
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => workspace.tabs.openHere(r1));

    expect(seen.at(-1)?.get()).toEqual({ kind: "run", hub: "acme", id: "r1" });
  });
});
