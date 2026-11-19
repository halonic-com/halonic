// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import {
  DESKTOP_WIDTH,
  PHONE_WIDTH,
  renderPhoneWindow,
  settle,
} from "../test-support/phone-window.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { PhoneTopBarActions, useInPhoneTopBar } from "./phone-top-bar-actions.tsx";

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

function InboxView() {
  return <h1 tabIndex={-1}>Inbox</h1>;
}

/** A page with its own ⋮: in the phone's top bar, else in its header. */
function AgentsWithMenuView() {
  const inTopBar = useInPhoneTopBar();
  const menu = (
    <button type="button" aria-label="More actions for Agents">
      ⋮
    </button>
  );
  return (
    <>
      <h1 tabIndex={-1}>Agents</h1>
      {inTopBar ? (
        <PhoneTopBarActions>{menu}</PhoneTopBarActions>
      ) : (
        <div className="page-head">{menu}</div>
      )}
    </>
  );
}

/** A place's top page with a + of its own, next to the top bar's Search. */
function InboxWithNewView() {
  return (
    <>
      <h1 tabIndex={-1}>Inbox</h1>
      <PhoneTopBarActions>
        <button type="button" aria-label="New rule">
          +
        </button>
      </PhoneTopBarActions>
    </>
  );
}

const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  register(studio) {
    studio.places.add({ id: "inbox", view: "InboxView", load: async () => ({ InboxView }) });
  },
});

const inboxWithNewFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  register(studio) {
    studio.places.add({
      id: "inbox",
      view: "InboxView",
      load: async () => ({ InboxView: InboxWithNewView }),
    });
  },
});

const agentsWithMenuFeature = defineFeature({
  id: "agents",
  title: "Agents",
  register(studio) {
    studio.places.add({
      id: "agents",
      view: "AgentsView",
      load: async () => ({ AgentsView: AgentsWithMenuView }),
    });
  },
});

verifies("shell.phone-top-bar-actions", () => {
  it("puts a page's own button in the top bar, after the title, and takes it away on Back", async () => {
    const { container, title, button, openUnderMore } = renderPhoneWindow([
      inboxFeature,
      agentsWithMenuFeature,
    ]);
    await openUnderMore("Agents");

    expect(title()).toBe("Agents");
    const menu = button("More actions for Agents");
    expect(menu).not.toBeNull();
    // A flex item of the top bar's actions, like Search: the slot itself draws no box.
    expect(menu?.parentElement?.className).toBe("contents");
    expect(container.querySelector("main .page-head")).toBeNull();
    expect(container.querySelector('main button[aria-label="More actions for Agents"]')).toBeNull();

    act(() => button("Back")?.click());
    await settle();
    expect(button("More actions for Agents")).toBeNull();
  });

  it("puts the page's buttons after Search at the top of a place", async () => {
    const { container, tapPlace } = renderPhoneWindow([inboxWithNewFeature, agentsWithMenuFeature]);
    tapPlace("Inbox");
    await settle();

    const labels = [...container.querySelectorAll("header button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Search", "New rule"]);
  });

  it("draws nothing in a desktop tab, where the page shows the button in its header", async () => {
    const { container, workspace } = renderPhoneWindow([inboxFeature, agentsWithMenuFeature]);
    act(() => media.resize(DESKTOP_WIDTH));
    act(() => workspace.tabs.openHere({ key: "agents", title: "Agents" }));
    await settle();

    expect(container.querySelector(".page-head button")?.getAttribute("aria-label")).toBe(
      "More actions for Agents",
    );
    expect(container.querySelectorAll('button[aria-label="More actions for Agents"]')).toHaveLength(
      1,
    );
  });
});
