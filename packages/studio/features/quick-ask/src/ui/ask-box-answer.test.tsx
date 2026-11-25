// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ask, byText, openBox, press, textBox } from "../test-support/box-page.tsx";
import { agent, card, chat, FakeMessenger } from "../test-support/fake-messenger.ts";
import { unmountAll } from "../test-support/render.tsx";

const chief = agent("Chief");

afterEach(unmountAll);

/** Chief's chat, with Chief working as the box reads it. */
function workingChief(messenger: FakeMessenger): void {
  messenger.chats = [chat({ ...chief, activity: "working" })];
}

verifies("quick-ask.box", () => {
  describe("sent, the agent is working", () => {
    it("shows the question at once, clears the box and keeps the focus", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Where are we with the release?");

      expect(page.querySelector("[data-question]")?.textContent).toBe(
        "Where are we with the release?",
      );
      expect(textBox(page).value).toBe("");
      expect(document.activeElement).toBe(textBox(page));
      expect(messenger.messagesOf.get("chat-Chief")?.map((each) => each.body)).toEqual([
        "Where are we with the release?",
      ]);
    });

    it("says the agent is working and that the box can close", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");

      expect(page.textContent).toContain(
        "You can close this. The answer comes to your chat with Chief.",
      );
      expect(page.querySelector("[data-working]")).toBeNull();
      workingChief(messenger);
      await act(async () => messenger.change("acme"));
      expect(page.querySelector("[data-working]")?.textContent).toBe("Chief is working");
      expect(page.textContent).toContain(
        "You can close this. The answer comes to your chat with Chief.",
      );
    });
  });

  describe("the answer", () => {
    it("shows the answer in a polite live region, offers Copy and a reply to the agent", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");
      messenger.reply(chief, "The release card is with the board.", "2026-11-25T13:41:00.000Z");
      await act(async () => messenger.change("acme"));

      expect(page.querySelector("[data-answer]")?.textContent).toBe(
        "The release card is with the board.",
      );
      expect(
        page.querySelector("[data-answer]")?.closest("[aria-live]")?.getAttribute("aria-live"),
      ).toBe("polite");
      expect(page.querySelector("[data-working]")).toBeNull();
      expect(textBox(page).placeholder).toBe("Reply to Chief");
      expect(page.querySelector("footer")?.textContent).toBe("Copy");
    });

    it("sends a reply to the same chat", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");
      messenger.reply(chief, "With the board.", "2026-11-25T13:41:00.000Z");
      await act(async () => messenger.change("acme"));
      messenger.sentAt = "2026-11-25T13:42:00.000Z";
      await ask(page, "Thanks. When?");

      expect(messenger.messagesOf.get("chat-Chief")?.map((each) => each.body)).toEqual([
        "Where are we?",
        "With the board.",
        "Thanks. When?",
      ]);
      expect([...page.querySelectorAll("[data-question]")].map((each) => each.textContent)).toEqual(
        ["Where are we?", "Thanks. When?"],
      );
    });
  });

  describe("the answer asks something", () => {
    it("says the agent asks you to choose, with the card's question", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger);
      await ask(page, "Shall we ship?");
      messenger.cardsOf = [card(chief, "Ship 0.2.0 today?", "2026-11-25T13:41:00.000Z")];
      await act(async () => messenger.change("acme"));

      expect(page.querySelector("[data-answer]")?.textContent).toBe(
        "Chief asks you to chooseShip 0.2.0 today?",
      );
    });
  });

  describe("not sent", () => {
    it("keeps the question once, edged in danger, with the reason, and Try again sends it", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      messenger.refuse = "offline";
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");
      const question = page.querySelector("[data-question]");

      expect(question?.textContent).toBe("Where are we?");
      expect(question?.className).toContain("border-danger");
      expect(textBox(page).value).toBe("");
      expect(page.textContent).toContain("Not sent · Try again");
      expect(page.textContent).toContain(
        "Couldn't reach Paperclip · Acme. Your question is still here.",
      );

      messenger.refuse = undefined;
      await press(byText(page, "button", "Try again"));
      expect(page.textContent).not.toContain("Not sent");
      expect(page.querySelectorAll("[data-question]")).toHaveLength(1);
      expect(messenger.messagesOf.get("chat-Chief")?.map((each) => each.body)).toEqual([
        "Where are we?",
      ]);
    });
  });
});
