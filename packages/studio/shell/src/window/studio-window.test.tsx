// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import { searchPageLocation } from "../search/search-page-names.ts";
import { serviceKey } from "../service-key.ts";
import { createShell, type Shell } from "../shell.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PlaceViewProps } from "./studio-page.tsx";
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

/** A service only the _inbox_ feature's context can reach. */
const InboxHeading = serviceKey<string>("inbox.heading");

/** The Inbox place's view: its `h1`, worded by a service from its feature's context. */
function InboxView({ context }: PlaceViewProps) {
  return (
    <h1 tabIndex={-1} className="inbox-view">
      {context.services.get(InboxHeading)}
    </h1>
  );
}

const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  provides: [InboxHeading],
  register(studio) {
    studio.services.provide(InboxHeading, () => "Inbox");
    studio.places.add({
      id: "inbox",
      view: "InboxView",
      load: async () => ({ InboxView }),
      signal: () => ({ mark: "count", value: 2, spoken: "2 waiting" }),
    });
  },
});

function renderWindow(
  shell: Shell = createShell({ features: [inboxFeature], timers: new FakeTimers() }),
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
  const link = (name: string) =>
    Array.from(container.querySelectorAll<HTMLAnchorElement>("a")).find((a) =>
      a.textContent?.startsWith(name),
    );
  return { container, workspace, link };
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.studio-window", () => {
  it("shows the window tabs, the toolbar, the sidebar and Home in a new workspace", () => {
    const { container, link } = renderWindow();

    expect(container.querySelector('[role="tablist"][aria-label="Open tabs"]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Location"]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
    expect(container.querySelector("main h1")?.textContent).toBe("Home");
    expect(link("Home")?.getAttribute("aria-current")).toBe("page");
  });

  it("lists the places features added after Home, with their signals", () => {
    const { container } = renderWindow();

    const places = Array.from(container.querySelectorAll('nav[aria-label="Places"] a'));
    expect(places.map((place) => place.textContent)).toEqual(["Home", "Inbox2, 2 waiting"]);
  });

  it("opens a place's view in the active tab, with its feature's context", async () => {
    const { container, workspace, link } = renderWindow();

    act(() => link("Inbox")?.click());
    await settle();

    expect(currentLocation(workspace.tabs.active).key).toBe("inbox");
    expect(container.querySelector("main h1.inbox-view")?.textContent).toBe("Inbox");
  });

  it("shows the Search page for a tab on a search", () => {
    const { container, workspace } = renderWindow();

    act(() => workspace.tabs.openHere(searchPageLocation("refund")));

    expect(currentLocation(workspace.tabs.active).title).toBe("Search: refund");
    expect(
      container.querySelector<HTMLInputElement>('main input[aria-label="Search words"]')?.value,
    ).toBe("refund");
  });

  it("opens the Ctrl K palette from the sidebar's Search box", () => {
    const { container } = renderWindow();
    expect(container.querySelector("dialog[open]")).toBeNull();

    const search = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-keyshortcuts") === "Control+K",
    );
    act(() => search?.click());

    expect(container.querySelector('dialog[open][aria-label="Search"]')).not.toBeNull();
  });

  it("opens a new tab on Home with the palette over it from +", () => {
    const { container, workspace } = renderWindow();

    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="New tab"]')?.click());

    expect(workspace.tabs.state.tabs).toHaveLength(2);
    expect(currentLocation(workspace.tabs.active).key).toBe("home");
    expect(container.querySelector('dialog[open][aria-label="Search"]')).not.toBeNull();
  });

  it("stops following the tabs for Recent once the workspace is disposed", () => {
    const { workspace } = renderWindow();
    act(() => workspace.tabs.openHere({ key: "inbox", title: "Inbox" }));
    expect(workspace.recent.list.map((place) => place.key)).toContain("inbox");

    workspace.dispose();
    act(() => workspace.tabs.openHere(searchPageLocation("refund")));

    expect(workspace.recent.list.map((place) => place.key)).not.toContain(
      searchPageLocation("refund").key,
    );
  });
});
