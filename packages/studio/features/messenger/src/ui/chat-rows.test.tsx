// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { openChat, openMessenger, settle, typeAndSend } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme's Chief and Liam, each with a chat; Chief's last message came at 9:30 and wasn't read. */
function acme() {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const liam = messaging.addAgent(source.id, { name: "Liam" });
  const chiefChat = messaging.addConversation(chief.id);
  messaging.addConversation(liam.id);
  clock.now = new Date(2026, 10, 25, 9, 30);
  messaging.addMessage(chiefChat.id, { body: "Shall I merge #12?\nIt's green." });
  return { messaging, clock, source, chief, chiefChat };
}

/** The Messenger at noon on the same day. */
const noon = () => new Date(2026, 10, 25, 12, 0);

function row(page: HTMLElement, name: string): HTMLElement | undefined {
  return [...page.querySelectorAll<HTMLElement>("nav li button")].find((each) =>
    each.textContent?.startsWith(`${name[0]}${name}`),
  );
}

verifies("messenger.chat-rows", () => {
  describe("chat rows", () => {
    it("show the newest message's first line, its time and an unread count, and no source with one", async () => {
      const { messaging } = acme();
      const page = await openMessenger(messaging, [], false, noon);
      expect(row(page, "Chief")?.textContent).toBe("CChief09:30Shall I merge #12?1 unread");
      expect(row(page, "Liam")?.textContent).toBe("LLiam");
    });

    it("count the agent's messages since the person's own, hide the count on the open chat, and stop at 99+", async () => {
      const { messaging, clock, chiefChat } = acme();
      messaging.addMessage(chiefChat.id, { author: { kind: "me" }, body: "Which branch?" });
      clock.now = new Date(2026, 10, 25, 9, 40);
      messaging.addMessage(chiefChat.id, { body: "main" });
      messaging.addMessage(chiefChat.id, { body: "Merging now", automatic: true });
      messaging.addMessage(chiefChat.id, { body: "Done" });
      const page = await openMessenger(messaging, [], false, noon);
      expect(row(page, "Chief")?.querySelector("[data-unread]")?.textContent).toBe("2 unread");
      await openChat(page, "Chief");
      expect(row(page, "Chief")?.querySelector("[data-unread]")).toBeNull();
      await openChat(page, "Liam");
      await act(async () => {
        clock.now = new Date(2026, 10, 25, 11, 0);
        for (let index = 0; index < 100; index++) messaging.addMessage(chiefChat.id, { body: "x" });
      });
      await settle();
      expect(row(page, "Chief")?.querySelector("[data-unread]")?.textContent).toBe("99+ unread");
    });

    it("lose the count once the chat was open, and say You: before the person's own message", async () => {
      const { messaging } = acme();
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      expect(row(page, "Chief")?.querySelector("[data-unread]")).toBeNull();
      await openChat(page, "Liam");
      expect(row(page, "Chief")?.querySelector("[data-unread]")).toBeNull();
      await typeAndSend(await openChat(page, "Chief"), "Yes");
      expect(row(page, "Chief")?.textContent).toBe("CChief09:30You: Yes");
    });

    it("show a violet dot after the name while the chat's agent has cards open, and no card label", async () => {
      const { messaging, source, chief } = acme();
      const card = {
        question: "Merge #12?",
        from: { kind: "agent", agent: chief.id, name: "Chief" },
        options: [{ id: "yes", label: "Yes" }],
      } as const;
      messaging.addInboxItem(source.id, card);
      messaging.addInboxItem(source.id, card);
      const page = await openMessenger(messaging, [], false, noon);
      const dot = row(page, "Chief")?.querySelector("[data-flag]");
      expect(dot?.className).toContain("bg-warning");
      expect(dot?.className).toContain("size-1.5");
      expect(dot?.textContent).toBe(", needs you");
      expect(row(page, "Chief")?.textContent).not.toContain("card");
      expect(row(page, "Liam")?.querySelector("[data-flag]")).toBeNull();
    });

    it("name their source once the chats come from two", async () => {
      const { messaging, clock } = acme();
      const globex = messaging.addSource({ label: "Paperclip · Globex" });
      await act(async () => {
        clock.now = new Date(2026, 10, 25, 8, 0);
        messaging.addConversation(messaging.addAgent(globex.id, { name: "Chief" }).id);
      });
      const page = await openMessenger(messaging, [], false, noon);
      const rows = [...page.querySelectorAll("nav li button")].map((each) => each.textContent);
      expect(rows).toEqual([
        "CChief · Paperclip · Acme09:30Shall I merge #12?1 unread",
        "LLiam · Paperclip · Acme",
        "CChief · Paperclip · Globex",
      ]);
    });
  });
});
