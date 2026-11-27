// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openMessenger, press, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

function acme() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chat = messaging.addConversation(messaging.addAgent(source.id, { name: "Chief" }).id);
  return { messaging, chat };
}

const notAnswering = "The engine isn't answering. It may still be starting.";

verifies("messenger.load-states", () => {
  describe("loading and failed reads", () => {
    it("shows loading rows while the chats are on their way, never No chats yet", async () => {
      vi.useFakeTimers();
      const { messaging } = acme();
      vi.spyOn(messaging, "listConversations").mockReturnValue(new Promise(() => undefined));
      const page = await openMessenger(messaging);
      await act(async () => vi.advanceTimersByTime(300));
      expect(page.textContent).not.toContain("No chats yet");
      const said = [...page.querySelectorAll('nav [role="status"]')].map(
        (each) => each.textContent,
      );
      expect(said).toContain("Loading your chats");
      expect(page.querySelector("nav [aria-busy='true']")).not.toBeNull();
      expect(page.querySelectorAll("nav [aria-busy='true'] li")).toHaveLength(3);
      // In the shape of the 72px chat rows, with their 48px picture (`kit.plain-row-size`).
      const loadingRow = page.querySelector("nav [aria-busy='true'] li") as HTMLElement;
      expect(loadingRow.className.split(" ")).toEqual(expect.arrayContaining(["h-row", "py-1.5"]));
      expect(loadingRow.className.split(" ")).not.toContain("min-h-row");
      expect(loadingRow.firstElementChild?.className.split(" ")).toContain("size-12");
    });

    it("says it couldn't load the chats, with Try again, when the first read fails", async () => {
      const { messaging } = acme();
      const list = vi.spyOn(messaging, "listConversations");
      list.mockRejectedValue(new Error("socket closed"));
      const page = await openMessenger(messaging);
      expect(page.textContent).toContain("Couldn't load your chats");
      expect(page.textContent).toContain(notAnswering);
      expect(page.textContent).not.toContain("No chats yet");
      list.mockRestore();
      await press(byText(page, "nav button", "Try again"));
      expect(page.querySelectorAll("nav li button")).toHaveLength(1);
      expect(page.textContent).not.toContain("Couldn't load your chats");
    });

    it("shows no New button over Couldn't load your chats", async () => {
      const { messaging } = acme();
      vi.spyOn(messaging, "listConversations").mockRejectedValue(new Error("socket closed"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const page = await openMessenger(messaging);
      expect(page.textContent).toContain("Couldn't load your chats");
      expect(byText(page, "nav button", "New")).toBeUndefined();
    });

    it("breathes the loading rows three times, and not at all under reduced motion", async () => {
      vi.useFakeTimers();
      const { messaging } = acme();
      vi.spyOn(messaging, "listConversations").mockReturnValue(new Promise(() => undefined));
      const animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
      HTMLElement.prototype.animate = animate;
      try {
        await openMessenger(messaging);
        await act(async () => vi.advanceTimersByTime(300));
        expect(animate).toHaveBeenCalledWith(
          [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }],
          expect.objectContaining({ duration: 1600, iterations: 3 }),
        );
        animate.mockClear();
        vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
        unmountAll();
        await openMessenger(messaging);
        await act(async () => vi.advanceTimersByTime(300));
        expect(animate).not.toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(HTMLElement.prototype, "animate");
        vi.unstubAllGlobals();
      }
    });

    it("keeps the chats it showed under the Inbox's stale line when a later read fails", async () => {
      const { messaging, chat } = acme();
      const page = await openMessenger(messaging);
      vi.spyOn(messaging, "listConversations").mockRejectedValue(new Error("socket closed"));
      await act(async () => void messaging.addMessage(chat.id, { body: "Morning" }));
      await settle();
      expect(page.querySelectorAll("nav li button")).toHaveLength(1);
      expect(page.querySelector('nav [role="status"]')?.textContent).toBe(
        "The engine isn't answering. Showing what it said last.",
      );
    });
  });
});
