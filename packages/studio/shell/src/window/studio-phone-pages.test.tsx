// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineFeature } from "../feature.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { fakeShowModal } from "../test-support/fake-show-modal.ts";
import { PHONE_WIDTH, renderPhoneWindow, settle } from "../test-support/phone-window.tsx";
import { unmountAll } from "../test-support/render.tsx";
import type { PlaceViewProps } from "./studio-page.tsx";

let restoreMedia: () => void;
let restoreModal: () => void;

beforeEach(() => {
  restoreMedia = new FakeMediaQueries(PHONE_WIDTH).install();
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

const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  register(studio) {
    studio.places.add({ id: "inbox", view: "InboxView", load: async () => ({ InboxView }) });
  },
});

/** The pushed page's way to close itself, kept so a test can call it after the page is gone. */
let closeReplyWriter: () => void = () => undefined;

/**
 * A place whose page notes a row and pushes a page that is no list, and shows the row it got
 * back; the pushed page can close itself.
 */
function ChangesView({ context, sub, memory }: PlaceViewProps) {
  if (sub !== undefined) {
    closeReplyWriter = () => context.closePlacePage?.("changes", sub);
    return (
      <>
        <h1 tabIndex={-1}>{`Changes ${sub}`}</h1>
        <button type="button" className="close-page" onClick={closeReplyWriter}>
          Close
        </button>
      </>
    );
  }
  return (
    <>
      <h1 tabIndex={-1}>Changes</h1>
      <p className="kept-row">{memory?.row?.id ?? "no row"}</p>
      <button
        type="button"
        className="push-page"
        onClick={() => {
          if (memory !== undefined) memory.row = { id: "reply-writer", index: 2 };
          context.openPlacePage?.("changes", "reply-writer", "Reply writer");
        }}
      >
        Reply writer
      </button>
    </>
  );
}

const changesFeature = defineFeature({
  id: "changes",
  title: "Changes",
  register(studio) {
    studio.places.add({
      id: "changes",
      view: "ChangesView",
      load: async () => ({ ChangesView }),
    });
  },
});

verifies("shell.studio-phone", () => {
  it("pushes a page above a place's page, with Back and no bottom navigation", async () => {
    const { container, title, heading, button, openUnderMore } = renderPhoneWindow([
      inboxFeature,
      changesFeature,
    ]);
    await openUnderMore("Changes");
    act(() => container.querySelector<HTMLButtonElement>("button.push-page")?.click());
    await settle();

    expect(title()).toBe("Reply writer");
    expect(heading()).toBe("Changes reply-writer");
    expect(container.querySelector('nav[aria-label="Places"]')).toBeNull();

    act(() => button("Back")?.click());
    await settle();
    expect(heading()).toBe("Changes");
    expect(container.querySelector('nav[aria-label="Places"]')).not.toBeNull();
  });

  it("lets a pushed page close itself, and moves nothing once the user has left it", async () => {
    const { container, title, heading, button, openUnderMore } = renderPhoneWindow([
      inboxFeature,
      changesFeature,
    ]);
    await openUnderMore("Changes");
    act(() => container.querySelector<HTMLButtonElement>("button.push-page")?.click());
    await settle();
    act(() => container.querySelector<HTMLButtonElement>("button.close-page")?.click());
    await settle();
    expect(heading()).toBe("Changes");

    act(() => container.querySelector<HTMLButtonElement>("button.push-page")?.click());
    await settle();
    act(() => button("Back")?.click());
    await settle();
    act(() => closeReplyWriter());
    await settle();
    expect(title()).toBe("Changes");
    expect(heading()).toBe("Changes");
  });

  /** What scrolls a phone page: `main`, or in a short window (`short:`) the whole phone column. */
  const layouts = [
    { name: "a phone", scrollerOf: (main: HTMLElement) => main },
    {
      name: "a short window",
      scrollerOf: (main: HTMLElement) => main.parentElement?.parentElement as HTMLElement,
    },
  ];

  for (const layout of layouts) {
    it(`starts a pushed page at its top and gives a page its scroll and its noted row back after Back, in ${layout.name}`, async () => {
      const { container, button, openUnderMore } = renderPhoneWindow([
        inboxFeature,
        changesFeature,
      ]);
      const scroller = layout.scrollerOf(container.querySelector("main") as HTMLElement);
      // jsdom loads no styles, so the scroller is told here that it scrolls, as the window's CSS does.
      scroller.style.overflowY = "auto";
      await openUnderMore("Changes");
      expect(container.querySelector(".kept-row")?.textContent).toBe("no row");
      scroller.scrollTop = 300;
      act(() => {
        scroller.dispatchEvent(new Event("scroll"));
      });
      act(() => container.querySelector<HTMLButtonElement>("button.push-page")?.click());
      await settle();
      // jsdom has no layout to clamp the scroll, so only the page itself puts it at the top.
      expect(scroller.scrollTop).toBe(0);

      act(() => button("Back")?.click());
      await settle();
      expect(scroller.scrollTop).toBe(300);
      expect(container.querySelector(".kept-row")?.textContent).toBe("reply-writer");
    });
  }
});
