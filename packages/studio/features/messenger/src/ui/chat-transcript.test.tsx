// @vitest-environment jsdom
import type { SendResult } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  byText,
  openChat,
  openMessenger,
  press,
  settle,
  typeAndSend,
} from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Chief's chat: "Morning" at 9:00 and "Build is green" at 9:01 from Chief, "Thanks" at 9:05. */
function chiefsChat() {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { body: "Morning" });
  clock.now = new Date(2026, 10, 25, 9, 1);
  messaging.addMessage(chat.id, { body: "Build is green" });
  clock.now = new Date(2026, 10, 25, 9, 5);
  messaging.addMessage(chat.id, { author: { kind: "me" }, body: "Thanks" });
  return { messaging, clock, source, chief, chat };
}

const noon = () => new Date(2026, 10, 25, 12, 0);

function lines(page: HTMLElement): string[] {
  return [...page.querySelectorAll("main ol > li")].map((line) => line.textContent ?? "");
}

/** The transcript's scrolling box, scrolled up by the person: 800px above the end. */
function scrolledUp(page: HTMLElement): HTMLElement {
  const scroller = page.querySelector("main ol")?.parentElement;
  if (!(scroller instanceof HTMLElement)) throw new Error("no transcript");
  Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 200 });
  scroller.scrollTop = 0;
  scroller.dispatchEvent(new Event("scroll"));
  return scroller;
}

verifies("messenger.chat-transcript", () => {
  describe("the open chat", () => {
    it("shows the agent's run under its name and time, the person's message in a bubble, and the day", async () => {
      const { messaging } = chiefsChat();
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      expect(lines(page)).toEqual([
        "Today",
        "CChief · 09:00Chief: Morning",
        "Chief: Build is green",
        "You: Thanks09:05",
      ]);
    });

    it("shows a sent message at once with Sending…, then its time once it was sent", async () => {
      const { messaging, clock } = chiefsChat();
      const send = messaging.send.bind(messaging);
      let land = () => undefined as unknown;
      vi.spyOn(messaging, "send").mockImplementation(
        (...args) => new Promise<SendResult>((done) => (land = () => done(send(...args)))),
      );
      const page = await openMessenger(messaging, [], false, noon);
      const box = await openChat(page, "Chief");
      clock.now = new Date(2026, 10, 25, 9, 30);
      await typeAndSend(box, "On it");
      expect(lines(page).at(-1)).toBe("You: On itSending…");
      expect(box.value).toBe("");
      await act(async () => void land());
      await settle();
      expect(lines(page).at(-1)).toBe("You: On it09:30");
      expect(page.querySelector("[data-pending]")).toBeNull();
    });

    it("puts a message the source refused back in the box", async () => {
      const { messaging } = chiefsChat();
      vi.spyOn(messaging, "send").mockResolvedValue({ outcome: "refused", reason: "not-found" });
      const page = await openMessenger(messaging, [], false, noon);
      const box = await openChat(page, "Chief");
      await typeAndSend(box, "On it");
      expect(page.querySelector("[data-pending]")).toBeNull();
      expect(box.value).toBe("On it");
    });

    it("stays at the newest message, and scrolled up says 1 new message ↓ instead", async () => {
      const { messaging, chat } = chiefsChat();
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      const scroller = scrolledUp(page);
      const scrollTo = vi.fn();
      scroller.scrollTo = scrollTo;
      await act(async () => void messaging.addMessage(chat.id, { body: "Merged" }));
      await settle();
      expect(scrollTo).not.toHaveBeenCalled();
      expect(page.querySelector("[data-new-messages]")?.textContent).toBe("1 new message ↓");
      await act(async () => void messaging.addMessage(chat.id, { body: "Deployed" }));
      await settle();
      expect(page.querySelector("[data-new-messages]")?.textContent).toBe("2 new messages ↓");
      await press(page.querySelector("[data-new-messages] button"));
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: "smooth" });
      expect(page.querySelector("[data-new-messages]")).toBeNull();
      // At the end again, the next message keeps the chat there.
      await act(async () => void messaging.addMessage(chat.id, { body: "Done" }));
      await settle();
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: "auto" });
      expect(page.querySelector("[data-new-messages]")).toBeNull();
    });

    it("says it couldn't load the chat, with Try again, when its first read fails", async () => {
      const { messaging } = chiefsChat();
      const page = await openMessenger(messaging, [], false, noon);
      const read = vi.spyOn(messaging, "listMessages").mockRejectedValue(new Error("gone"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await openChat(page, "Chief");
      expect(page.querySelector("main")?.textContent).toContain("Couldn't load this chat");
      read.mockRestore();
      await press(byText(page, "main button", "Try again"));
      expect(lines(page)).toHaveLength(4);
    });

    it("keeps the messages, the cards bar and the box in one column at most 800px wide", async () => {
      const { messaging, source, chief } = chiefsChat();
      const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
      messaging.addInboxItem(source.id, { question: "Merge?", from, options: [] });
      const page = await openMessenger(messaging, [], false, noon);
      const box = await openChat(page, "Chief");
      const columns = [
        page.querySelector("main ol"),
        page.querySelector("[data-cards-bar] > div"),
        box.closest(".max-w-\\[800px\\]"),
      ];
      for (const column of columns) {
        expect(column?.classList.contains("max-w-[800px]")).toBe(true);
        expect(column?.classList.contains("mx-auto")).toBe(true);
      }
    });
  });

  describe("the cards bar", () => {
    it("Next moves from one open card to the next, and back to the first after the last", async () => {
      const { messaging, clock, source, chief } = chiefsChat();
      const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
      for (const question of ["Merge #1?", "Merge #2?"]) {
        clock.now = new Date(clock.now.getTime() + 60_000);
        messaging.addInboxItem(source.id, { question, from, options: [{ id: "y", label: "Yes" }] });
      }
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      const next = byText(page, "[data-cards-bar] button", "Next");
      const focused = () => document.activeElement?.closest("[data-chat-card]")?.textContent;
      for (const question of ["Merge #1?", "Merge #2?", "Merge #1?"]) {
        await press(next);
        expect(focused()).toContain(question);
      }
    });
  });
});
