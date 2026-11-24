// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { useItemCardTaker } from "../item-page/item-card-takers.ts";
import { createShell } from "../shell.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { ItemViewProps } from "./item-view.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

let restore: (() => void)[] = [];

afterEach(() => {
  unmountAll();
  for (const undo of restore) undo();
  restore = [];
});

const agent = (id: string) => ({ kind: "agent", hub: "acme", id });
const run = (id: string) => ({ kind: "run", hub: "acme", id });
const team = ["writer", "checker"];

/** An agent's page: it takes the agents of its team as cards, and lists the cards it shows. */
function AgentView({ item }: ItemViewProps) {
  const [cards, setCards] = useState<readonly string[]>([]);
  useItemCardTaker((shown) => {
    if (shown.kind !== "agent" || !team.includes(shown.id) || item.id !== "triage") return false;
    setCards((now) => [...now, shown.id]);
    return true;
  });
  return (
    <>
      <h1 tabIndex={-1}>Agent {item.id}</h1>
      {cards.map((card) => (
        <section key={card} className="card">
          {card}
        </section>
      ))}
    </>
  );
}

/** A run's page, which takes no cards. */
function RunView({ item }: ItemViewProps) {
  return <h1 tabIndex={-1}>Run {item.id}</h1>;
}

/**
 * Draws a window of this width with agents and runs (`r99` isn't there), and a dialog host with a
 * "Chat box" button that keeps the context it gets, as a side panel's chat would.
 */
async function windowWith(width: number) {
  restore = [new FakeMediaQueries(width).install(), fakeShowModal()];
  const contexts: WorkspaceContext[] = [];
  const feature = defineFeature({
    id: "items",
    title: "Items",
    register(studio) {
      studio.itemKinds.add({
        kind: "agent",
        label: "Agent",
        icon: "agents",
        open: { view: "AgentView", load: async () => ({ AgentView }) },
        tab: { describe: (item) => ({ label: `Agent ${item.id}` }), exists: () => true },
      });
      studio.itemKinds.add({
        kind: "run",
        label: "Run",
        icon: "runs",
        open: { view: "RunView", load: async () => ({ RunView }) },
        // No `subscribe`: `showItem` still asks `exists`.
        tab: {
          describe: (item) => ({ label: `Run ${item.id}` }),
          exists: (item) => item.id !== "r99",
        },
      });
      studio.dialogs.add({
        id: "items.chat",
        order: 10,
        view: "Chat",
        load: async () => ({
          Chat: ({ context }: { context: WorkspaceContext }) => {
            contexts.push(context);
            return <button type="button">Chat box</button>;
          },
        }),
      });
    },
  });
  const shell = createShell({ features: [feature], timers: new FakeTimers() });
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
  await settle();
  const context = contexts.at(-1);
  if (context === undefined) throw new Error("The dialog host wasn't drawn.");
  const chatBox = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Chat box",
  );
  return { context, tabs: workspace.tabs, container, chatBox };
}

/** Lets a lazily loaded view arrive. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.panels.show-replaces-windows", () => {
  it("shows an item the active page takes as a card there, without a tab", async () => {
    const { context, tabs, container } = await windowWith(1280);
    act(() => tabs.openHere({ key: "agent/acme/triage", title: "Agent triage" }));
    await settle();

    let shown: unknown;
    act(() => {
      shown = context.showItem?.(agent("writer"));
    });

    expect(shown).toEqual({ placed: "card", name: "Agent writer" });
    expect(tabs.state.tabs).toHaveLength(1);
    expect([...container.querySelectorAll(".card")].map((card) => card.textContent)).toEqual([
      "writer",
    ]);
  });

  it("opens an item no page takes in its own active tab, leaving the focus where it is", async () => {
    const { context, tabs, container, chatBox } = await windowWith(1280);
    const home = tabs.active.id;
    act(() => chatBox?.focus());
    expect(document.activeElement).toBe(chatBox);

    let shown: unknown;
    act(() => {
      shown = context.showItem?.(run("r42"));
    });
    await settle();

    expect(shown).toEqual({ placed: "tab", name: "Run r42" });
    expect(tabs.state.tabs.map((tab) => currentLocation(tab).key)).toEqual([
      "home",
      "run/acme/r42",
    ]);
    expect(currentLocation(tabs.active).key).toBe("run/acme/r42");
    expect(tabs.active.id).not.toBe(home);
    expect(container.querySelector("[data-tab-page]:not([hidden]) h1")?.textContent).toBe(
      "Run r42",
    );
    expect(document.activeElement).toBe(chatBox);
  });

  it("makes a tab that shows the item already active, with no second tab", async () => {
    const { context, tabs, chatBox } = await windowWith(1280);
    const home = tabs.active.id;
    let r42 = "";
    act(() => {
      r42 = tabs.openInNewTab({ key: "run/acme/r42", title: "Run r42" }).tab.id;
    });
    // It was shown once, so its page is kept mounted when it isn't active.
    act(() => tabs.activate(r42));
    await settle();
    act(() => tabs.activate(home));
    act(() => chatBox?.focus());

    let shown: unknown;
    act(() => {
      shown = context.showItem?.(run("r42"));
    });

    expect(shown).toEqual({ placed: "tab", name: "Run r42" });
    expect(tabs.state.tabs).toHaveLength(2);
    expect(tabs.active.id).toBe(r42);
    expect(document.activeElement).toBe(chatBox);
  });

  it("answers unknown, and changes nothing, for a kind nobody added or an item that isn't there", async () => {
    const { context, tabs } = await windowWith(1280);
    const before = tabs.state;

    expect(context.showItem?.({ kind: "report", hub: "acme", id: "q3" })).toEqual({
      placed: "unknown",
    });
    expect(context.showItem?.(run("r99"))).toEqual({ placed: "unknown" });
    expect(tabs.state).toBe(before);
  });

  it("gives a phone's contexts no showItem", async () => {
    const { context } = await windowWith(390);

    expect(context.showItem).toBeUndefined();
  });
});
