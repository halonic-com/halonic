// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { serviceKey } from "../service-key.ts";
import { createShell } from "../shell.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { MapTarget } from "../test-support/map-target.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PlaceViewProps } from "./studio-page.tsx";
import { StudioWindow } from "./studio-window.tsx";
import { StudioWorkspace } from "./studio-workspace.ts";

/** A phone's width, under `PHONE_MAX_WIDTH`. */
const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(PHONE_WIDTH);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  restoreModal();
  restoreMedia();
  window.history.replaceState(null, "");
});

/** A service only the _inbox_ feature's context can reach. */
const InboxHeading = serviceKey<string>("inbox.heading");

function InboxView({ context }: PlaceViewProps) {
  return (
    <h1 tabIndex={-1} className="inbox-view">
      {context.services.get(InboxHeading)}
    </h1>
  );
}

function AgentsView() {
  return <h1 tabIndex={-1}>Agents</h1>;
}

function BrokenAgentsView(): never {
  throw new Error("the agents view broke");
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

const agentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  register(studio) {
    studio.places.add({ id: "agents", view: "AgentsView", load: async () => ({ AgentsView }) });
  },
});

const brokenAgentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  register(studio) {
    studio.places.add({
      id: "agents",
      view: "AgentsView",
      load: async () => ({ AgentsView: BrokenAgentsView }),
    });
  },
});

function renderPhoneWindow(features = [inboxFeature, agentsFeature]) {
  const shell = createShell({ features, timers: new FakeTimers() });
  const services = new MapTarget();
  shell.services.instantiate(services);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services });
  const container = render(
    <StudioWindow
      shell={shell}
      workspace={workspace}
      host="served"
      platform="linux"
      language="en"
    />,
  );
  const title = () => container.querySelector("header p")?.textContent;
  const heading = () => container.querySelector("main h1")?.textContent;
  const button = (name: string) =>
    container.querySelector<HTMLButtonElement>(`header button[aria-label="${name}"]`);
  const tapPlace = (name: string) =>
    act(() =>
      container
        .querySelector<HTMLElement>(`nav[aria-label="Places"] a[aria-label^="${name}"]`)
        ?.click(),
    );
  const openUnderMore = async (name: string) => {
    tapPlace("More");
    const row = [...container.querySelectorAll("main tr")].find((candidate) =>
      candidate.textContent?.includes(name),
    );
    act(() => row?.querySelector<HTMLElement>("[role=gridcell]")?.click());
    await settle();
  };
  return { container, workspace, title, heading, button, tapPlace, openUnderMore };
}

/** Lets the lazily imported views resolve and React draw them. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("shell.studio-phone", () => {
  it("shows the top bar with Search, Home and the bottom navigation, and no window tabs", () => {
    const { container, title, heading, button } = renderPhoneWindow();

    expect(title()).toBe("Home");
    expect(button("Search")).not.toBeNull();
    expect(button("Back")).toBeNull();
    expect(heading()).toBe("Home");
    const home = container.querySelector('nav[aria-label="Places"] a[aria-label^="Home"]');
    expect(home?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(container.querySelector('nav[aria-label="Location"]')).toBeNull();
  });

  it("shows the Inbox with its signal in the bottom navigation, and its view when tapped", async () => {
    const { container, title, tapPlace } = renderPhoneWindow();
    const inbox = container.querySelector('nav[aria-label="Places"] a[aria-label^="Inbox"]');
    expect(inbox?.getAttribute("aria-label")).toBe("Inbox, 2 waiting");

    tapPlace("Inbox");
    await settle();

    expect(title()).toBe("Inbox");
    expect(container.querySelector("main h1.inbox-view")?.textContent).toBe("Inbox");
  });

  it("opens a place under More with Back, and Back goes back to the More page", async () => {
    const { container, title, heading, button, tapPlace, openUnderMore } = renderPhoneWindow();
    tapPlace("More");
    expect(heading()).toBe("More");
    expect(container.querySelector('button[aria-label^="Workspace:"]')).toBeNull();

    await openUnderMore("Agents");
    expect(title()).toBe("Agents");
    expect(heading()).toBe("Agents");

    act(() => button("Back")?.click());
    expect(heading()).toBe("More");
  });

  it("opens the Search sheet from the top bar", () => {
    const { container, button } = renderPhoneWindow();

    act(() => button("Search")?.click());

    expect(container.querySelector("dialog[open] h2")?.textContent).toBe("Search");
  });

  it("goes back to Home on Android's back from the Inbox", async () => {
    const { title, tapPlace } = renderPhoneWindow();
    tapPlace("Inbox");
    await settle();

    // As the browser does: the shell's entry comes off, and `popstate` fires on the one under it.
    act(() => {
      window.history.replaceState(null, "");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(title()).toBe("Home");
  });

  it("comes back to where each layout was when the width crosses the phone's", async () => {
    const { container, workspace, heading, tapPlace } = renderPhoneWindow();
    act(() => media.resize(DESKTOP_WIDTH));
    act(() => workspace.tabs.openHere({ key: "inbox", title: "Inbox" }));
    act(() => media.resize(PHONE_WIDTH));
    tapPlace("More");

    act(() => media.resize(DESKTOP_WIDTH));
    expect(currentLocation(workspace.tabs.active).key).toBe("inbox");
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();

    act(() => media.resize(PHONE_WIDTH));
    expect(heading()).toBe("More");
  });

  it("stops only a page that throws, with the bars still working", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container, title, heading, openUnderMore, tapPlace } = renderPhoneWindow([
      inboxFeature,
      brokenAgentsFeature,
    ]);

    await openUnderMore("Agents");

    expect(title()).toBe("Agents");
    expect(container.querySelector("main")?.textContent).toContain("This page stopped working");
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();

    tapPlace("Home");
    expect(heading()).toBe("Home");
  });

  it("doesn't keep the palette open on a phone, so it doesn't pop up on widening", () => {
    const { container } = renderPhoneWindow();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });

    act(() => media.resize(DESKTOP_WIDTH));

    expect(container.querySelector('dialog[open][aria-label="Search"]')).toBeNull();
  });
});
