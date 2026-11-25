// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Messenger } from "../messenger.ts";
import { openChat, openMessenger, said, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** Acme's Chief, working on the board's "Is 0.3 ready?" from 9:00, and Liam's empty chat. */
function acme() {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief", activity: "working" });
  const liam = messaging.addAgent(source.id, { name: "Liam" });
  const chat = messaging.addConversation(chief.id);
  messaging.addConversation(liam.id);
  messaging.addMessage(chat.id, { author: { kind: "me" }, body: "Is 0.3 ready?" });
  return { messaging, clock, chat };
}

const noon = () => new Date(2026, 10, 25, 12, 0);

function row(page: HTMLElement, name: string): HTMLElement | undefined {
  return [...page.querySelectorAll<HTMLElement>("nav li button")].find((each) =>
    each.textContent?.startsWith(`${name[0]}${name}`),
  );
}

function header(page: HTMLElement): string | null | undefined {
  return page.querySelector("main header p")?.textContent;
}

verifies("messenger.automatic-notes", () => {
  describe("an automatic note", () => {
    it("shows as Chief's bubble with a dashed edge and the automatic mark", async () => {
      const { messaging, clock, chat } = acme();
      clock.now = new Date(2026, 10, 25, 9, 0, 2);
      messaging.addMessage(chat.id, { body: "On it. Checking the build.", automatic: true });
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      const note = page.querySelector("main ol > li[data-automatic]");
      expect(note?.querySelector("[data-bubble]")?.className).toContain("border-dashed");
      expect(note?.querySelector("[data-automatic-mark] svg")).not.toBeNull();
      expect(note?.textContent).toContain(
        "Written automatically from what Chief is doing. Chief's own answer follows. Chief: On it. Checking the build.",
      );
    });

    it("is followed by Chief's answer under its own name and time", async () => {
      const { messaging, clock, chat } = acme();
      clock.now = new Date(2026, 10, 25, 9, 0, 2);
      messaging.addMessage(chat.id, { body: "On it. Checking the build.", automatic: true });
      clock.now = new Date(2026, 10, 25, 9, 4);
      messaging.addMessage(chat.id, { body: "Yes, 0.3 is built." });
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      const heads = [...page.querySelectorAll("main ol > li[data-head]")];
      expect(heads.map((each) => each.querySelector("p")?.textContent)).toEqual([
        "CChief · 09:00",
        "CChief · 09:04",
      ]);
    });

    it("changes neither the row's preview, nor its unread dot, nor Chief's working line", async () => {
      const { messaging, clock, chat } = acme();
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Liam");
      const before = row(page, "Chief")?.textContent;
      expect(before).toBe("CChief09:00You: Is 0.3 ready?");

      clock.now = new Date(2026, 10, 25, 9, 0, 2);
      await act(async () => {
        messaging.addMessage(chat.id, { body: "On it. Checking the build.", automatic: true });
      });
      await settle();
      expect(row(page, "Chief")?.textContent).toBe(before);
      expect(row(page, "Chief")?.querySelector("[data-unread]")).toBeNull();
      await openChat(page, "Chief");
      expect(header(page)).toBe("Paperclip · Acme · Working");
    });

    it("isn't read out as Chief's reply, and Chief's answer after it is", async () => {
      const { messaging, clock, chat } = acme();
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      clock.now = new Date(2026, 10, 25, 9, 0, 2);
      await act(async () => {
        messaging.addMessage(chat.id, { body: "On it. Checking the build.", automatic: true });
      });
      await settle();
      expect(said(page)).toBe("");
      clock.now = new Date(2026, 10, 25, 9, 4);
      await act(async () => {
        messaging.addMessage(chat.id, { body: "Yes, 0.3 is built." });
      });
      await settle();
      expect(said(page)).toBe("Chief: Yes, 0.3 is built.");
    });

    it("isn't the reply: the chat doesn't wait for the board until Chief answers", async () => {
      const { messaging, clock, chat } = acme();
      const messenger = new Messenger(messaging, noon);
      clock.now = new Date(2026, 10, 25, 9, 0, 2);
      messaging.addMessage(chat.id, { body: "On it.", automatic: true });
      expect(await messenger.rows("waiting")).toEqual([]);
      clock.now = new Date(2026, 10, 25, 9, 1);
      messaging.addMessage(chat.id, { body: "Yes, 0.3 is built." });
      const [waiting] = await messenger.rows("waiting");
      expect(waiting?.last?.body).toBe("Yes, 0.3 is built.");
      expect(waiting === undefined ? false : messenger.unread(waiting)).toBe(true);
    });
  });
});
