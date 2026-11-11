// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import type { PlaceContribution, PlaceSignal } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { TabSet } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { StudioSidebar } from "./studio-sidebar.tsx";

let restoreMedia: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(1280).install();
});

afterEach(() => {
  unmountAll();
  restoreMedia();
});

/** The Inbox's waiting items as a feature would keep them: a count that tells its listeners. */
class WaitingCount {
  value = 0;
  readonly listeners = new Set<() => void>();

  set(value: number): void {
    this.value = value;
    for (const listener of this.listeners) {
      listener();
    }
  }

  signal(): PlaceSignal {
    return { mark: "count", value: this.value, spoken: `${this.value} waiting` };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function inboxPlace(waiting: WaitingCount): Registered<PlaceContribution> {
  return {
    featureId: "inbox",
    id: "inbox",
    view: "InboxView",
    load: async () => ({}),
    signal: () => waiting.signal(),
    subscribeSignal: (_context, listener) => waiting.subscribe(listener),
  };
}

function renderSidebar(places: readonly Registered<PlaceContribution>[]) {
  const tabs = new TabSet();
  const announcer = createAnnouncer({ timers: new FakeTimers() });
  const context = { services: { get: () => undefined }, announcer } as unknown as WorkspaceContext;
  const container = render(
    <StudioSidebar
      places={places}
      tabs={tabs}
      announcer={announcer}
      platform="windows"
      contextFor={() => context}
      onSearch={() => {}}
    />,
  );
  const inbox = () =>
    Array.from(container.querySelectorAll('nav[aria-label="Places"] a')).find((a) =>
      a.textContent?.startsWith("Inbox"),
    )?.textContent;
  return { tabs, inbox };
}

verifies("shell.place-signal-changes", () => {
  it("shows a new count as soon as the place says its signal changed, with no tab change", () => {
    const waiting = new WaitingCount();
    waiting.set(2);
    const { tabs, inbox } = renderSidebar([inboxPlace(waiting)]);
    const tabsBefore = tabs.state;
    expect(inbox()).toBe("Inbox2, 2 waiting");

    act(() => waiting.set(3));

    expect(inbox()).toBe("Inbox3, 3 waiting");
    expect(tabs.state).toBe(tabsBefore);
  });

  it("drops the count when the signal changes to zero", () => {
    const waiting = new WaitingCount();
    waiting.set(1);
    const { inbox } = renderSidebar([inboxPlace(waiting)]);

    act(() => waiting.set(0));

    expect(inbox()).toBe("Inbox");
  });

  it("stops listening when the sidebar goes away", () => {
    const waiting = new WaitingCount();
    renderSidebar([inboxPlace(waiting)]);
    expect(waiting.listeners.size).toBe(1);

    unmountAll();

    expect(waiting.listeners.size).toBe(0);
  });
});
