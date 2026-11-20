// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardProps } from "../home/home-page.tsx";
import { serviceKey } from "../service-key.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import {
  DESKTOP_WIDTH,
  PHONE_WIDTH,
  renderPhoneWindow as renderWith,
  settle,
} from "../test-support/phone-window.tsx";
import { unmountAll } from "../test-support/render.tsx";
import type { PlaceViewProps } from "./studio-page.tsx";

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

/** A place whose top page has a row that pushes a list, and whose pushed list says what it got. */
function RoutinesView({ context, sub }: PlaceViewProps) {
  if (sub !== undefined) {
    return (
      <>
        <h1 tabIndex={-1}>{`Routines ${sub}`}</h1>
        <button
          type="button"
          className="push-weekly"
          onClick={() => context.openPlaceList?.("routines", "weekly", "Weekly")}
        >
          Weekly
        </button>
      </>
    );
  }
  return (
    <>
      <h1 tabIndex={-1}>Routines</h1>
      <button
        type="button"
        className="push-list"
        onClick={() => context.openPlaceList?.("routines", "daily", "Daily")}
      >
        Daily
      </button>
      <button
        type="button"
        className="push-weekly"
        onClick={() => context.openPlaceList?.("routines", "weekly", "Weekly")}
      >
        Weekly
      </button>
    </>
  );
}

const routinesFeature = defineFeature({
  id: "routines",
  title: "Routines",
  register(studio) {
    studio.places.add({
      id: "routines",
      view: "RoutinesView",
      load: async () => ({ RoutinesView }),
    });
  },
});

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

/** Home's Needs you, as a button that opens the Inbox through its context. */
function OpenInboxCard({ context }: HomeCardProps) {
  return (
    <button type="button" className="open-inbox" onClick={() => context.openPlace?.("inbox")}>
      Open the Inbox
    </button>
  );
}

const openerFeature = defineFeature({
  id: "opener",
  title: "Opener",
  register(studio) {
    studio.home.addCard({
      id: "needs-you",
      view: "OpenInboxCard",
      load: async () => ({ OpenInboxCard }),
    });
  },
});

function AppearanceSection() {
  return <p className="appearance-section">Appearance</p>;
}

/** A Settings section, and a Home card that opens it as a phone page. */
const settingsSectionFeature = defineFeature({
  id: "display",
  title: "Display",
  register(studio) {
    studio.settings.add({
      id: "appearance",
      title: "Appearance",
      scope: "display",
      order: 10,
      view: "AppearanceSection",
      load: async () => ({ AppearanceSection }),
    });
    studio.home.addCard({
      id: "needs-you",
      view: "OpenAppearanceCard",
      load: async () => ({ OpenAppearanceCard }),
    });
  },
});

function OpenAppearanceCard({ context }: HomeCardProps) {
  return (
    <button
      type="button"
      className="open-appearance"
      onClick={() => context.openSettings?.("appearance")}
    >
      Open Appearance
    </button>
  );
}

function renderPhoneWindow(features = [inboxFeature, agentsFeature]) {
  return renderWith(features);
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

  it("lets a view open a place as its list, as tapping it does", async () => {
    const { container, title } = renderPhoneWindow([inboxFeature, agentsFeature, openerFeature]);
    await settle();

    act(() => container.querySelector<HTMLButtonElement>("button.open-inbox")?.click());
    await settle();

    expect(title()).toBe("Inbox");
    expect(container.querySelector("main h1.inbox-view")?.textContent).toBe("Inbox");
    const inbox = container.querySelector('nav[aria-label="Places"] a[aria-label^="Inbox"]');
    expect(inbox?.getAttribute("aria-current")).toBe("page");
  });

  it("pushes a list above a place's page for the view, with Back and the bottom navigation", async () => {
    const { container, title, heading, button, openUnderMore } = renderPhoneWindow([
      inboxFeature,
      routinesFeature,
    ]);
    await openUnderMore("Routines");
    act(() => container.querySelector<HTMLButtonElement>("button.push-list")?.click());
    await settle();

    expect(title()).toBe("Daily");
    expect(heading()).toBe("Routines daily");
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();

    act(() => button("Back")?.click());
    await settle();
    expect(heading()).toBe("Routines");
  });

  it("replaces a pushed list with another from it, so Back leads to the place's page", async () => {
    const { container, title, heading, button, openUnderMore } = renderPhoneWindow([
      inboxFeature,
      routinesFeature,
    ]);
    await openUnderMore("Routines");
    act(() => container.querySelector<HTMLButtonElement>("button.push-list")?.click());
    await settle();
    act(() => container.querySelector<HTMLButtonElement>("button.push-weekly")?.click());
    await settle();
    expect(title()).toBe("Weekly");
    expect(heading()).toBe("Routines weekly");

    act(() => button("Back")?.click());
    await settle();
    expect(heading()).toBe("Routines");
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

  it("pads a Settings section's page 16px left and right, with room under the last control", async () => {
    const { container } = renderPhoneWindow([settingsSectionFeature]);
    await settle();
    act(() => container.querySelector<HTMLElement>(".open-appearance")?.click());
    await settle();
    const wrapper = container
      .querySelector(".appearance-section")
      ?.closest('[data-testid="settings-section-page"]');
    expect(wrapper?.classList.contains("px-4")).toBe(true);
    expect(wrapper?.classList.contains("pb-6")).toBe(true);
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

verifies("shell.place-signal-changes", () => {
  it("shows a new count in the bottom navigation as soon as the place says its signal changed", () => {
    // An answer drops the Inbox's count at once; the phone's bar mustn't wait for a page move (HAL-13371).
    let waiting = 1;
    const listeners = new Set<() => void>();
    const countingInbox = defineFeature({
      id: "inbox",
      title: "Inbox",
      register(studio) {
        studio.places.add({
          id: "inbox",
          view: "InboxView",
          load: async () => ({ InboxView }),
          signal: () => ({ mark: "count", value: waiting, spoken: `${waiting} waiting` }),
          subscribeSignal: (_context, listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        });
      },
    });
    const { container } = renderPhoneWindow([countingInbox, agentsFeature]);
    const inbox = () =>
      container
        .querySelector('nav[aria-label="Places"] a[aria-label^="Inbox"]')
        ?.getAttribute("aria-label");
    expect(inbox()).toBe("Inbox, 1 waiting");

    act(() => {
      waiting = 0;
      for (const listener of listeners) listener();
    });

    expect(inbox()).toBe("Inbox");
  });
});
