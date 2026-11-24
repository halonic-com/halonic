// @vitest-environment jsdom
import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Messenger } from "../messenger.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { MessengerPage } from "./messenger-page.tsx";

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

/** Renders the Messenger and lets its first reads land. */
async function openMessenger(messaging: FakeAgentMessaging, opened: string[] = []) {
  const page = render(
    <OpenExternalProvider openExternal={async (address) => void opened.push(await address)}>
      <MessengerPage messenger={new Messenger(messaging)} />
    </OpenExternalProvider>,
  );
  await settle();
  return page;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

function rows(page: HTMLElement): string[] {
  return [...page.querySelectorAll("nav li")].map((row) => row.textContent ?? "");
}

async function press(element: Element | null | undefined): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error("nothing to press");
  await act(async () => element.click());
  await settle();
}

function byText(page: HTMLElement, selector: string, text: string): Element | undefined {
  return [...page.querySelectorAll(selector)].find((each) => each.textContent?.includes(text));
}

/** Opens Acme's chat with Chief, the one whose row names Acme. */
async function openAcmeChat(page: HTMLElement): Promise<HTMLTextAreaElement> {
  await press(byText(page, "nav li button", "Acme"));
  const box = page.querySelector("textarea");
  if (box === null) throw new Error("no message box");
  return box;
}

async function typeAndSend(box: HTMLTextAreaElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
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
    it("shows two conversations named Chief, each with its source's label and activity", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      expect(rows(page)).toEqual([
        "CChief · Paperclip · AcmeWaiting",
        "CChief · Paperclip · GlobexIdle",
      ]);
    });

    it("lists under Waiting for me only the conversation whose agent wrote last", async () => {
      const { messaging } = twoChiefs();
      const page = await openMessenger(messaging);
      await press(byText(page, '[role="tab"]', "Waiting for me"));
      expect(rows(page)).toEqual(["CChief · Paperclip · AcmeWaiting"]);
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
