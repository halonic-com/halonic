// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { HomeCardProps } from "../home/home-page.tsx";
import {
  currentPhonePage,
  goBackOnPhone,
  type PlaceStacks,
  showPhonePage,
  startPlaceStacks,
  switchPhonePlace,
} from "../phone/place-stacks.ts";
import { currentLocation } from "../tabs/tab-set.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import {
  DESKTOP_WIDTH,
  PHONE_WIDTH,
  renderPhoneWindow,
  settle,
} from "../test-support/phone-window.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { desktopPageOf } from "./layout-crossing.ts";
import type { PlaceViewProps } from "./studio-page.tsx";

let media: FakeMediaQueries;
let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(DESKTOP_WIDTH);
  restoreMedia = media.install();
  restoreModal = fakeShowModal();
});

afterEach(() => {
  unmountAll();
  restoreModal();
  restoreMedia();
  window.history.replaceState(null, "");
});

function RunsView() {
  return <h1 tabIndex={-1}>Runs</h1>;
}

function RunView() {
  return <h1 tabIndex={-1}>Run #43</h1>;
}

/** Runs, and a run kind that names Runs as the place that lists it. */
const runsFeature = defineFeature({
  id: "runs",
  title: "Runs",
  register(studio) {
    studio.places.add({ id: "runs", view: "RunsView", load: async () => ({ RunsView }) });
    studio.itemKinds.add({
      kind: "run",
      label: "Run",
      icon: "runs",
      place: "runs",
      open: { view: "RunView", load: async () => ({ RunView }) },
    });
  },
});

function InboxView() {
  return <h1 tabIndex={-1}>Inbox</h1>;
}

const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  register(studio) {
    studio.places.add({ id: "inbox", view: "InboxView", load: async () => ({ InboxView }) });
  },
});

/** Routines, whose page pushes a list "Daily" on a phone. */
function RoutinesView({ context, sub }: PlaceViewProps) {
  return (
    <>
      <h1 tabIndex={-1}>{sub === undefined ? "Routines" : `Routines ${sub}`}</h1>
      <button
        type="button"
        className="push-daily"
        onClick={() => context.openPlaceList?.("routines", "daily", "Daily")}
      >
        Daily
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

function AppearanceSection() {
  return <p className="appearance-section">Appearance</p>;
}

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

/** A Settings section, and a Home card that opens it. */
const displayFeature = defineFeature({
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

const run = { key: "run/acme/43", title: "Run #43", kind: "run" };

function focusedText(): string | null | undefined {
  return document.activeElement?.textContent;
}

verifies("shell.studio-phone", () => {
  describe("narrowing to the phone width", () => {
    it("keeps the active tab's run open, with the focus on its title and Back to Runs", async () => {
      const studio = renderPhoneWindow([runsFeature, inboxFeature]);
      act(() => studio.workspace.tabs.openHere(run));
      await settle();

      act(() => media.resize(PHONE_WIDTH));
      await settle();

      expect(studio.title()).toBe("Run #43");
      expect(studio.heading()).toBe("Run #43");
      expect(focusedText()).toBe("Run #43");
      act(() => studio.button("Back")?.click());
      await settle();
      expect(studio.heading()).toBe("Runs");
    });

    it("keeps a place open as the phone's place", async () => {
      const studio = renderPhoneWindow([runsFeature, inboxFeature]);
      act(() => studio.workspace.tabs.openHere({ key: "inbox", title: "Inbox" }));
      await settle();

      act(() => media.resize(PHONE_WIDTH));
      await settle();

      expect(studio.heading()).toBe("Inbox");
      const inbox = studio.container.querySelector(
        'nav[aria-label="Places"] a[aria-label^="Inbox"]',
      );
      expect(inbox?.getAttribute("aria-current")).toBe("page");
    });
  });

  describe("widening to the desktop width", () => {
    beforeEach(() => media.resize(PHONE_WIDTH));

    it("shows the phone's page in the active tab, with the focus on its title", async () => {
      const studio = renderPhoneWindow([runsFeature, inboxFeature]);
      studio.tapPlace("Inbox");
      await settle();

      act(() => media.resize(DESKTOP_WIDTH));
      await settle();

      expect(currentLocation(studio.workspace.tabs.active).key).toBe("inbox");
      expect(studio.heading()).toBe("Inbox");
      expect(focusedText()).toBe("Inbox");
    });

    it("opens the place for a list the place pushed, which the desktop doesn't have", async () => {
      const studio = renderPhoneWindow([routinesFeature]);
      await studio.openUnderMore("Routines");
      act(() => studio.container.querySelector<HTMLButtonElement>("button.push-daily")?.click());
      await settle();

      act(() => media.resize(DESKTOP_WIDTH));
      await settle();

      expect(currentLocation(studio.workspace.tabs.active).key).toBe("routines");
    });

    it("opens the Settings dialog on the section the phone showed", async () => {
      const studio = renderPhoneWindow([displayFeature]);
      await settle();
      act(() => studio.container.querySelector<HTMLElement>(".open-appearance")?.click());
      await settle();

      act(() => media.resize(DESKTOP_WIDTH));
      await settle();

      expect(studio.container.querySelector("dialog[open] .appearance-section")).not.toBeNull();
    });
  });

  describe("the desktop's page for a phone page", () => {
    it("is none for More, whose work the sidebar does", () => {
      expect(desktopPageOf({ key: "more", title: "More" })).toEqual({ kind: "none" });
    });

    it("is the same page for a place or an item", () => {
      expect(desktopPageOf(run)).toEqual({ kind: "tab", location: run });
    });

    it("is the same page for an item whose key starts with a place's name", () => {
      const card = { key: "inbox/card/7", title: "Send the reply?" };
      expect(desktopPageOf(card)).toEqual({ kind: "tab", location: card });
    });
  });

  describe("the phone's page for a desktop tab", () => {
    const keys = (stacks: PlaceStacks) =>
      stacks.stacks[stacks.place].map((page) => page.location.key);

    it("opens an item above the place that lists it, under More for Workflows", () => {
      const workflow = { key: "workflow/acme/support-reply", title: "Support reply" };
      const stacks = showPhonePage(startPlaceStacks(), workflow, "workflows");
      expect(stacks.place).toBe("more");
      expect(keys(stacks)).toEqual(["more", "workflows", workflow.key]);
    });

    it("opens a page no place lists above Home", () => {
      const stacks = showPhonePage(switchPhonePlace(startPlaceStacks(), "runs"), run);
      expect(stacks.place).toBe("home");
      expect(keys(stacks)).toEqual(["home", run.key]);
      expect(currentPhonePage(goBackOnPhone(stacks) as PlaceStacks).location.key).toBe("home");
    });

    it("changes nothing when the phone shows the page already", () => {
      const stacks = showPhonePage(startPlaceStacks(), run, "runs");
      expect(showPhonePage(stacks, run, "runs")).toBe(stacks);
    });
  });
});
