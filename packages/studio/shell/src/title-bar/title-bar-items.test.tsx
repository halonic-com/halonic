// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { PhoneTopBarActions } from "../phone/phone-top-bar-actions.tsx";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import {
  DESKTOP_WIDTH,
  PHONE_WIDTH,
  renderPhoneWindow,
  settle,
} from "../test-support/phone-window.tsx";
import { unmountAll } from "../test-support/render.tsx";

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

function AccountButton() {
  return (
    <button type="button" aria-label="Account menu">
      AM
    </button>
  );
}

function InboxView() {
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

function AgentsView() {
  return <h1 tabIndex={-1}>Agents</h1>;
}

const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  register(studio) {
    studio.places.add({ id: "inbox", view: "InboxView", load: async () => ({ InboxView }) });
  },
});

const agentsFeature = defineFeature({
  id: "agents",
  title: "Agents",
  register(studio) {
    studio.places.add({ id: "agents", view: "AgentsView", load: async () => ({ AgentsView }) });
  },
});

const accountFeature = defineFeature({
  id: "account",
  title: "Account",
  register(studio) {
    studio.titleBar.add({
      id: "account.menu",
      order: 1,
      view: "AccountButton",
      load: async () => ({ AccountButton }),
    });
  },
});

const features = [inboxFeature, agentsFeature, accountFeature];

verifies("shell.title-bar-items", () => {
  it("draws a feature's item in the desktop title bar", async () => {
    const { container } = renderPhoneWindow(features);
    act(() => media.resize(DESKTOP_WIDTH));
    await settle();

    const titleBar = container.querySelector("[data-layout='desktop'] > header");
    expect(titleBar?.querySelector('button[aria-label="Account menu"]')).not.toBeNull();
  });

  it("puts it after Search and before the page's own buttons at the top of a place", async () => {
    const { container, tapPlace } = renderPhoneWindow(features);
    tapPlace("Inbox");
    await settle();

    const labels = [...container.querySelectorAll("header button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Search", "Account menu", "New rule"]);
  });

  it("leaves it out of the phone's top bar under a place", async () => {
    const { button, openUnderMore } = renderPhoneWindow(features);
    await openUnderMore("Agents");

    expect(button("Back")).not.toBeNull();
    expect(button("Account menu")).toBeNull();
  });
});
