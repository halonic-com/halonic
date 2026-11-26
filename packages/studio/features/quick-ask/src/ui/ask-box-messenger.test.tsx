// @vitest-environment jsdom
import { clockTime, standaloneLinkClasses } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AskMemory, memoryStorage } from "../ask-memory.ts";
import { ask, byText, described, openBox, press } from "../test-support/box-page.tsx";
import { agent, card, chat, FakeMessenger } from "../test-support/fake-messenger.ts";
import { unmountAll } from "../test-support/render.tsx";

const chief = agent("Chief");
const liam = agent("Liam");

afterEach(unmountAll);

/** The name a screen reader gives an element with no label: its text, leaving out what's hidden. */
function accessibleName(element: Node): string {
  if (element instanceof HTMLElement && element.getAttribute("aria-hidden") === "true") return "";
  if (!(element instanceof HTMLElement)) return element.textContent ?? "";
  return [...element.childNodes].map(accessibleName).join("");
}

verifies("quick-ask.messenger", () => {
  describe("the answer", () => {
    it("offers Open in Messenger after Copy, which closes the box on the agent's chat", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page, window, closed } = await openBox(messenger);
      await ask(page, "Where are we?");
      messenger.reply(chief, "The release card is with the board.", "2026-11-25T13:41:00.000Z");
      await act(async () => messenger.change("acme"));

      expect(page.querySelector("footer")?.textContent).toBe("CopyOpen in Messenger");
      const open = byText(page, "footer button", "Open in Messenger");
      expect(open?.className).toBe(`ml-auto ${standaloneLinkClasses}`);
      await press(open);
      expect(window.chatsOpened).toEqual(["chat-Chief"]);
      expect(window.hidden).toBe(0);
      expect(closed).toHaveLength(1);
    });

    it("offers no Open in Messenger before the agent has answered", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");

      expect(page.querySelector("footer")?.textContent).not.toContain("Open in Messenger");
    });
  });

  describe("the answer asks something", () => {
    it("offers Answer in Messenger under the card as its primary button, which opens the agent's chat", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page, window } = await openBox(messenger);
      await ask(page, "Shall we ship?");
      messenger.cardsOf = [card(chief, "Ship 0.2.0 today?", "2026-11-25T13:41:00.000Z")];
      await act(async () => messenger.change("acme"));

      expect(page.querySelector("[data-answer]")?.textContent).toBe(
        "Chief asks you to chooseShip 0.2.0 today?Answer in Messenger",
      );
      const answer = byText(page, "[data-answer] button", "Answer in Messenger");
      expect(answer?.className).toContain("bg-primary");
      await press(answer);
      expect(window.chatsOpened).toEqual(["chat-Chief"]);
    });

    it("describes Answer in Messenger by the card's question, so several cards' buttons differ", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Shall we ship?");
      messenger.cardsOf = [card(chief, "Ship 0.2.0 today?", "2026-11-25T13:41:00.000Z")];
      await act(async () => messenger.change("acme"));

      const button = byText(page, "[data-answer] button", "Answer in Messenger");
      expect(described(button)).toBe("Ship 0.2.0 today?");
    });
  });

  describe("last answer", () => {
    it("ends the hint row with the answer that came while the box was closed, and opens its chat", async () => {
      const messenger = new FakeMessenger([chat(chief), chat(liam)]);
      const storage = memoryStorage();
      new AskMemory(storage).setPending({
        conversation: "chat-Liam",
        sentAt: "2026-11-25T13:30:00.000Z",
      });
      const answeredAt = "2026-11-25T13:41:00.000Z";
      messenger.reply(liam, "Merged.", answeredAt);
      const { page, window } = await openBox(messenger, storage);

      const time = clockTime(new Date(answeredAt), new Date());
      const link = byText(page, "footer button", "Last answer");
      expect(link?.textContent).toBe(`Last answer: Liam, ${time} ›`);
      expect(link?.className).toBe(`ml-auto ${standaloneLinkClasses}`);
      // The chevron is drawn, not read: screen readers hear the words alone.
      expect(link === undefined ? "" : accessibleName(link)).toBe(`Last answer: Liam, ${time}`);
      await press(link);
      expect(window.chatsOpened).toEqual(["chat-Liam"]);
      expect(new AskMemory(storage).pending()).toBeUndefined();
    });

    it("shows no last answer when none came while the box was closed", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief)]));

      expect(byText(page, "footer button", "Last answer")).toBeUndefined();
    });
  });
});

verifies("quick-ask.automatic-notes", () => {
  describe("an automatic note", () => {
    it("offers no Open in Messenger on the agent's receipt, only once its own answer comes", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");
      messenger.note(chief, "On it.", "2026-11-25T13:40:05.000Z");
      await act(async () => messenger.change("acme"));

      expect(page.querySelector("footer")?.textContent).toBe(
        "Enter ask Tab another agent Esc close",
      );
      expect(page.querySelector("[data-answer]")).toBeNull();

      messenger.reply(chief, "The release card is with the board.", "2026-11-25T13:41:00.000Z");
      await act(async () => messenger.change("acme"));
      expect(page.querySelector("footer")?.textContent).toBe("CopyOpen in Messenger");
      expect(page.querySelector("[data-answer]")?.textContent).toBe(
        "The release card is with the board.",
      );
    });
  });
});
