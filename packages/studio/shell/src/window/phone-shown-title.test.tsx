// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defineFeature } from "../feature.ts";
import type { PanelWindowViewProps } from "../panels/panel-window-slot.tsx";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { PHONE_WIDTH, renderPhoneWindow, settle } from "../test-support/phone-window.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { phoneShownTitle } from "./shown-title.ts";

let restore: (() => void)[] = [];

beforeEach(() => {
  restore = [new FakeMediaQueries(PHONE_WIDTH).install(), fakeShowModal()];
});

afterEach(() => {
  unmountAll();
  for (const undo of restore) undo();
  window.history.replaceState(null, "");
});

const none = { get: () => undefined, subscribe: () => () => {} };

/** A panel with the Assistant's status line at rest: "Looking at: " and the page's name. */
function LookingPanel({ context }: PanelWindowViewProps) {
  const source = context.shownTitle ?? none;
  const title = useSyncExternalStore(source.subscribe, source.get);
  return <p data-looking-at>{title === undefined ? "" : `Looking at: ${title}`}</p>;
}

const assistant = defineFeature({
  id: "assistant",
  title: "Assistant",
  register(studio) {
    studio.panelWindows.add({
      id: "assistant.panel",
      order: 10,
      title: "Assistant",
      view: "LookingPanel",
      load: async () => ({ LookingPanel }),
    });
  },
});

verifies("shell.shown-title", () => {
  it("names the phone's page in the panel opened from the orb on a phone", async () => {
    const phone = renderPhoneWindow([assistant]);
    const lookingAt = () => phone.container.querySelector("[data-looking-at]")?.textContent;

    act(() => phone.button("Assistant")?.click());
    await settle();

    expect(lookingAt()).toBe("Looking at: Home");
  });

  it("follows the phone to another place", async () => {
    const phone = renderPhoneWindow([assistant]);
    phone.tapPlace("More");
    await settle();

    act(() => phone.button("Assistant")?.click());
    await settle();

    expect(phone.container.querySelector("[data-looking-at]")?.textContent).toBe(
      "Looking at: More",
    );
  });

  it("tells a listener on a phone only when the page's name changes", () => {
    const phone = phoneShownTitle("Home");
    let heard = 0;
    const stop = phone.source.subscribe(() => {
      heard += 1;
    });

    phone.show("Home");
    phone.show("Inbox");
    stop();
    phone.show("More");

    expect(heard).toBe(1);
    expect(phone.source.get()).toBe("More");
  });
});
