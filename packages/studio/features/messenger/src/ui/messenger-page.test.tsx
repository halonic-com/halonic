// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  byText,
  openChat,
  openMessenger,
  press,
  said,
  settle,
  typeAndSend,
} from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** A clock that moves a minute on each read, so every item has its own time. */
function ticking(): () => Date {
  let minutes = 0;
  return () => new Date(Date.UTC(2026, 10, 24, 10, minutes++));
}

/** Two sources, each with an agent named Chief; Acme's Chief asked something and waits. */
function twoChiefs() {
  const messaging = new FakeAgentMessaging({ now: ticking() });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const globex = messaging.addSource({ label: "Paperclip · Globex" });
  const acmeChief = messaging.addAgent(acme.id, { name: "Chief", activity: "waiting" });
  const globexChief = messaging.addAgent(globex.id, { name: "Chief", activity: "idle" });
  const acmeChat = messaging.addConversation(acmeChief.id);
  messaging.addConversation(globexChief.id);
  messaging.addMessage(acmeChat.id, { body: "Shall I merge #12?" });
  return { messaging, acme, acmeChat };
}

function rows(page: HTMLElement): string[] {
  return [...page.querySelectorAll("nav li")].map((row) => row.textContent ?? "");
}

/** Opens Acme's chat with Chief, the one whose row names Acme. */
function openAcmeChat(page: HTMLElement): Promise<HTMLTextAreaElement> {
  return openChat(page, "Acme");
}

async function searchFor(page: HTMLElement, text: string): Promise<void> {
  const search = page.querySelector<HTMLInputElement>('input[type="search"]');
  if (search === null) throw new Error("no search box");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, text);
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

verifies("messenger.conversations", () => {
  describe("MessengerPage", () => {
    it("shows two conversations named Chief, each with its source's label, and the activity in the header", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      const [acme, globex] = rows(page);
      expect(acme).toMatch(/^CChief · Paperclip · Acme.*Shall I merge #12\?Unread$/);
      expect(globex).toBe("CChief · Paperclip · Globex");
      await openAcmeChat(page);
      expect(page.querySelector("main header p")?.textContent).toBe("Paperclip · Acme · Waiting");
    });

    it("lists under Waiting for me only the conversation whose agent wrote last", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      await press(byText(page, '[role="tab"]', "Waiting for me"));
      expect(rows(page)).toEqual([expect.stringMatching(/^CChief · Paperclip · Acme/)]);
      await press(byText(page, '[role="tab"]', "All"));
      expect(rows(page)).toHaveLength(2);
    });

    it("sends a message and shows it in the conversation, with the agent's activity in the header", async () => {
      const { messaging, acmeChat } = twoChiefs();
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      const box = await openAcmeChat(page);
      expect(page.querySelector("header")?.textContent).toContain("Paperclip · Acme · Waiting");
      await typeAndSend(box, "Morning");
      expect(send).toHaveBeenCalledWith(acmeChat.id, "Morning");
      expect(page.querySelector("main ol")?.textContent).toContain("You: Morning");
      expect(box.value).toBe("");
    });

    it("offline, keeps the typed text in the box and sends nothing", async () => {
      const { messaging, acme } = twoChiefs();
      messaging.goOffline(acme.id);
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      const box = await openAcmeChat(page);
      await typeAndSend(box, "Morning");
      expect(send).not.toHaveBeenCalled();
      expect(box.value).toBe("Morning");
      expect(page.textContent).toContain("Paperclip · Acme is offline. Your message stays here");
    });

    it("finds the chat's messages by their text", async () => {
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: "Morning" });
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      await searchFor(page, "merge");
      const shown = page.querySelector("main ol")?.textContent ?? "";
      expect(shown).toContain("Shall I merge #12?");
      expect(shown).not.toContain("Morning");
    });

    it("says so when no message in the chat matches the search", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      await searchFor(page, "invoice");
      const transcript = page.querySelector("main ol");
      expect(transcript?.textContent).not.toContain("Shall I merge #12?");
      // In a status region that is always there, outside the list, so a screen reader reads it.
      const status = byText(page, 'main [role="status"]', "No message in this chat matches.");
      expect(status?.textContent).toBe("No message in this chat matches.");
      expect(transcript?.contains(status ?? null)).toBe(false);
      await searchFor(page, "");
      expect(status?.isConnected).toBe(true);
      expect(status?.textContent).toBe("");
    });

    it("reads out what the agent writes after the chat opened, but not on a search or another chat", async () => {
      const { messaging, acmeChat } = twoChiefs();
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      expect(said(page)).toBe("");
      await searchFor(page, "merge");
      await searchFor(page, "");
      expect(said(page)).toBe("");
      await act(async () => void messaging.addMessage(acmeChat.id, { body: "x".repeat(150) }));
      await settle();
      expect(said(page)).toBe(`Chief: ${"x".repeat(100)}`);
      await openChat(page, "Globex");
      expect(said(page)).toBe("");
    });

    it("in a narrow window shows the list or the open chat, and Back to chats focuses its row", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging, [], true);
      expect(page.querySelector("main")).toBeNull();
      const box = await openAcmeChat(page);
      expect(page.querySelector("nav")).toBeNull();
      expect(document.activeElement).toBe(box);
      await press(byText(page, "main button", "Back to chats"));
      expect(page.querySelector("main")).toBeNull();
      expect(document.activeElement).toBe(byText(page, "nav li button", "Acme"));
    });

    it("in a narrow window, Back to chats focuses the tab when the chat left it (HAL-18316 MS6)", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging, [], true);
      await press(byText(page, '[role="tab"]', "Waiting for me"));
      const box = await openAcmeChat(page);
      // Answering it takes the chat off Waiting for me, and it stays open.
      await typeAndSend(box, "Yes, merge it");
      await press(byText(page, "main button", "Back to chats"));
      expect(rows(page)).toEqual([]);
      expect(document.activeElement).toBe(byText(page, '[role="tab"]', "Waiting for me"));
    });

    it("never lets a search's late answer replace a newer one's", async () => {
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, { body: "Morning" });
      const page = await openMessenger(messaging);
      await openAcmeChat(page);
      // From here each read waits until the test lets it answer.
      const held: (() => void)[] = [];
      const list = messaging.listMessages.bind(messaging);
      vi.spyOn(messaging, "listMessages").mockImplementation(
        (conversation) => new Promise((answer) => held.push(() => answer(list(conversation)))),
      );
      await searchFor(page, "merge");
      await searchFor(page, "morning");
      const [mergeAnswer, morningAnswer] = held;
      await act(async () => morningAnswer?.());
      await settle();
      await act(async () => mergeAnswer?.());
      await settle();
      const shown = page.querySelector("main ol")?.textContent ?? "";
      expect(shown).toContain("Morning");
      expect(shown).not.toContain("Shall I merge #12?");
    });

    it("renders a message's `<script>` and `javascript:` link as inert text, and opens web links outside", async () => {
      const { messaging, acmeChat } = twoChiefs();
      messaging.addMessage(acmeChat.id, {
        body: "<script>alert(1)</script> [Approve](javascript:alert(1)) ![x](https://acme.example/x.png) [PR](https://acme.example/pr/12)",
      });
      const opened: string[] = [];
      const page = await openMessenger(messaging, opened);
      await openAcmeChat(page);
      const transcript = page.querySelector("main ol");
      expect(transcript?.querySelector("script, img, iframe")).toBeNull();
      expect(transcript?.textContent).toContain("<script>alert(1)</script>");
      expect(transcript?.textContent).toContain("[Approve](javascript:alert(1))");
      const links = [...(transcript?.querySelectorAll("a") ?? [])].map((link) =>
        link.getAttribute("href"),
      );
      expect(links).toEqual(["https://acme.example/pr/12"]);
      await press(transcript?.querySelector("a"));
      expect(opened).toEqual(["https://acme.example/pr/12"]);
    });
  });
});
