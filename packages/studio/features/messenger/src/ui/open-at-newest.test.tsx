// @vitest-environment jsdom
import type { InboxItem } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openChat, openMessenger, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

/** Each `scrollIntoView` call: the element's text and its options; jsdom has no scrolling of its own. */
let scrolled: { text: string; options: unknown }[] = [];
/** The callbacks of the transcript's size watchers; jsdom has no `ResizeObserver`. */
let resized: ((entries: unknown[]) => void)[] = [];

beforeEach(() => {
  scrolled = [];
  resized = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element, options?: unknown) {
    scrolled.push({ text: this.textContent ?? "", options });
  };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries: unknown[]) => void) {
        resized.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

/** Chief's chat with 60 messages, "Message 1" to "Message 60", and one card Chief asked before the last. */
function longChat() {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  for (let index = 1; index <= 60; index += 1) {
    clock.now = new Date(2026, 10, 25, 9, index);
    if (index === 60) {
      messaging.addInboxItem(acme.id, {
        question: "Merge #1?",
        from: { kind: "agent", agent: chief.id, name: "Chief" },
        options: [{ id: "approve", label: "Approve" }],
      });
    }
    messaging.addMessage(chat.id, { body: `Message ${index}` });
  }
  return messaging;
}

/** Holds the next reads of the Inbox until `release` is called; the page's own first reads went through. */
function holdCards(messaging: FakeAgentMessaging) {
  const read = messaging.listInboxItems.bind(messaging);
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  messaging.listInboxItems = async (): Promise<readonly InboxItem[]> => {
    await gate;
    return read();
  };
  // The held reads take more turns than one settle: the fake reads, then the page sorts and sets.
  return {
    release: async () => {
      await act(async () => release());
      for (let round = 0; round < 3; round += 1) await settle();
    },
  };
}

/** The transcript's scrolling box, with a size the test gives it. */
function scroller(page: HTMLElement, scrollHeight: number): HTMLElement {
  const element = page.querySelector("main ol")?.parentElement;
  if (!(element instanceof HTMLElement)) throw new Error("no transcript");
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: 400 });
  return element;
}

verifies("messenger.open-at-newest", () => {
  describe("opening a chat", () => {
    it("shows the newest message on the first paint, before the cards land, with no motion", async () => {
      const messaging = longChat();
      const page = await openMessenger(messaging);
      const cards = holdCards(messaging);

      await openChat(page, "Chief");

      expect(page.textContent).toContain("Message 60");
      expect(page.textContent).not.toContain("Merge #1?");
      expect(scrolled.at(-1)).toEqual({
        text: expect.stringContaining("Message 60"),
        options: { block: "end" },
      });

      const box = scroller(page, 6000);
      box.scrollTo = vi.fn();
      await cards.release();
      expect(page.textContent).toContain("Merge #1?");
      expect(box.scrollTo).toHaveBeenLastCalledWith({ top: 6000, behavior: "auto" });
      expect(page.querySelector("[data-new-messages]")).toBeNull();
    });

    it("opens at the newest message when the cards can't be read", async () => {
      const messaging = longChat();
      const page = await openMessenger(messaging);
      vi.spyOn(console, "error").mockImplementation(() => {});
      messaging.listInboxItems = () => Promise.reject(new Error("offline"));

      await openChat(page, "Chief");

      expect(scrolled.at(-1)?.text).toContain("Message 60");
    });

    it("stays at the newest entry when the transcript grows", async () => {
      const messaging = longChat();
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      const box = scroller(page, 6400);
      box.scrollTo = vi.fn();

      await act(async () => {
        for (const callback of resized) callback([]);
      });

      expect(box.scrollTo).toHaveBeenLastCalledWith({ top: 6400, behavior: "auto" });
    });
  });
});
