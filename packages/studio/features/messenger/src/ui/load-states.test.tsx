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
    it("shows the tabs over loading rows while the chats are on their way, never No chats yet", async () => {
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
      // The tabs are drawn already, so the rows arrive where the skeleton rows stood.
      expect(page.querySelectorAll('nav [role="tab"]')).toHaveLength(2);
      expect(page.querySelectorAll("nav [aria-busy='true'] li")).toHaveLength(3);
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
