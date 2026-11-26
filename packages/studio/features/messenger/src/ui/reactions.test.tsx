// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, pressKey, settle } from "../test-support/page.tsx";
import { FakeReactions } from "../test-support/reactions.ts";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const noon = () => new Date(2026, 10, 25, 12, 0);

/**
 * Chief's chat yesterday: Chief's "Morning", which Chief and the board gave 👍 and Chief 😂, then
 * the board's "Thanks".
 */
function chiefsChat() {
  const clock = { now: new Date(2026, 10, 24, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  const morning = messaging.addMessage(chat.id, { body: "Morning" });
  messaging.addMessage(chat.id, { author: { kind: "me" }, body: "Thanks" });
  const reactions = new FakeReactions();
  const byChief = { kind: "agent", agent: chief.id, name: "Chief" } as const;
  reactions.add(morning.id, "😂", byChief);
  reactions.add(morning.id, "👍", byChief);
  reactions.add(morning.id, "👍", { kind: "me" });
  // What the Messenger asked the source to change, without the message's ID.
  const saved = () => reactions.saved.map(({ emoji, on }) => ({ emoji, on }));
  return { messaging, source, morning, reactions, saved };
}

async function openChiefsChat(chat: ReturnType<typeof chiefsChat>): Promise<HTMLElement> {
  const page = await openMessenger(chat.messaging, [], false, noon, undefined, chat.reactions);
  await openChat(page, "Chief");
  return page;
}

/** Each chip under the message holding `body`: what it shows, pressed or not. */
function chipsUnder(page: HTMLElement, body: string): string[] {
  const message = byText(page, "main li[data-message]", body);
  return [...(message?.querySelectorAll("[data-chip]") ?? [])].map((chip) => {
    const shown = chip.querySelector("[aria-hidden]")?.textContent ?? "";
    return chip.getAttribute("aria-pressed") === "true" ? `${shown} (mine)` : shown;
  });
}

function addButton(page: HTMLElement, body: string): HTMLElement | null | undefined {
  return byText(page, "main li[data-message]", body)?.querySelector<HTMLElement>(
    '[data-add-reaction] button[aria-haspopup="menu"]',
  );
}

function item(page: HTMLElement, name: string): Element | null {
  return page.querySelector(`main [data-add-reaction] [role="menu"] [aria-label="${name}"]`);
}

verifies("messenger.reactions", () => {
  describe("reactions under a message", () => {
    it("shows yesterday's message's reactions in the set's order, the board's own pressed", async () => {
      const page = await openChiefsChat(chiefsChat());
      expect(chipsUnder(page, "Morning")).toEqual(["👍 2 (mine)", "😂 1"]);
      const thumbs = byText(page, "main [data-chip]", "👍");
      expect(thumbs?.querySelector(".sr-only")?.textContent).toBe("Thumbs up, 2: you and Chief");
    });

    it("adds the board's Eyes from the row of six, at once, and gives focus back", async () => {
      const chat = chiefsChat();
      const page = await openChiefsChat(chat);
      await press(addButton(page, "Morning"));
      const items = [
        ...page.querySelectorAll(
          'main [data-add-reaction] [role="menu"] [role="menuitemcheckbox"]',
        ),
      ];
      expect(items.map((each) => each.textContent)).toEqual(["👍", "❤️", "😂", "😮", "✅", "👀"]);
      expect(item(page, "Thumbs up")?.getAttribute("aria-checked")).toBe("true");
      await press(item(page, "Eyes"));
      expect(chipsUnder(page, "Morning")).toEqual(["👍 2 (mine)", "😂 1", "👀 1 (mine)"]);
      expect(chat.saved()).toEqual([{ emoji: "👀", on: true }]);
      expect(page.querySelector('main [data-add-reaction] [role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(addButton(page, "Morning"));
    });

    it("takes the board's own off when its chip is pressed", async () => {
      const chat = chiefsChat();
      const page = await openChiefsChat(chat);
      await press(byText(page, "main button[data-chip]", "👍"));
      expect(chipsUnder(page, "Morning")).toEqual(["👍 1", "😂 1"]);
      expect(chat.saved()).toEqual([{ emoji: "👍", on: false }]);
    });

    it("puts the chip back and says so when saving fails", async () => {
      const chat = chiefsChat();
      chat.reactions.failSaves = true;
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const page = await openChiefsChat(chat);
      await press(addButton(page, "Morning"));
      await press(item(page, "Heart"));
      expect(chipsUnder(page, "Morning")).toEqual(["👍 2 (mine)", "😂 1"]);
      expect(page.textContent).toContain("Couldn't save the reaction. Try again.");
    });

    it("moves through the six with the arrows, Home and End, and Escape closes it", async () => {
      const page = await openChiefsChat(chiefsChat());
      await press(addButton(page, "Morning"));
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Thumbs up");
      await pressKey("ArrowRight");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Heart");
      await pressKey("End");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Eyes");
      await pressKey("ArrowRight");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Thumbs up");
      await pressKey("Home");
      await pressKey("ArrowLeft");
      expect(document.activeElement?.getAttribute("aria-label")).toBe("Eyes");
      await pressKey("Escape");
      expect(page.querySelector('main [data-add-reaction] [role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(addButton(page, "Morning"));
    });

    it("names the row after whose message it is", async () => {
      const page = await openChiefsChat(chiefsChat());
      await press(addButton(page, "Morning"));
      const row = () => page.querySelector('main [data-add-reaction] [role="menu"]');
      expect(row()?.getAttribute("aria-label")).toBe("React to Chief's message");
      await press(addButton(page, "Thanks"));
      expect(row()?.getAttribute("aria-label")).toBe("React to your message");
    });

    it("shows the chips but nothing to press while the source is offline", async () => {
      const chat = chiefsChat();
      const page = await openChiefsChat(chat);
      await act(async () => chat.messaging.goOffline(chat.source.id));
      await settle();
      expect(chipsUnder(page, "Morning")).toEqual(["👍 2", "😂 1"]);
      expect(page.querySelector("main button[data-chip]")).toBeNull();
      expect(addButton(page, "Morning")).toBeNull();
    });

    it("shows the chat without reactions where the source keeps none, or their read fails", async () => {
      for (const fault of ["keeps none", "read fails"]) {
        const chat = chiefsChat();
        if (fault === "keeps none") chat.reactions.keeps = false;
        else chat.reactions.failReads = true;
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        const page = await openChiefsChat(chat);
        expect(byText(page, "main li[data-message]", "Morning")).toBeDefined();
        expect(page.querySelector("main [data-reactions]")).toBeNull();
        unmountAll();
      }
    });
  });
});
