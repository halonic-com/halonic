// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskMemory, memoryStorage } from "../ask-memory.ts";
import {
  ask,
  byText,
  FakeClipboard,
  openBox,
  press,
  pressKey,
  settle,
  textBox,
  typeIn,
} from "../test-support/box-page.tsx";
import { agent, chat, FakeMessenger, Held } from "../test-support/fake-messenger.ts";
import { unmountAll } from "../test-support/render.tsx";

const chief = agent("Chief");
const liam = agent("Liam");

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A Messenger whose chats are still on their way when the box opens. */
function slowMessenger(): { messenger: FakeMessenger; read: Held } {
  const messenger = new FakeMessenger([chat(chief), chat(liam)]);
  const read = new Held();
  messenger.rowsHeld = read;
  return { messenger, read };
}

/** Moves the fake clock on, and lets what it started land. */
async function wait(ms: number): Promise<void> {
  await act(async () => vi.advanceTimersByTime(ms));
  await settle();
}

/** Asks Chief a question, and Chief answers it. */
async function answered(page: HTMLElement, messenger: FakeMessenger): Promise<void> {
  await ask(page, "Where are we?");
  messenger.reply(chief, "With the board.", "2026-11-25T13:41:00.000Z");
  await act(async () => messenger.change("acme"));
}

verifies("quick-ask.box-states", () => {
  describe("opening", () => {
    it("shows the row at once, takes typing, and draws the skeleton, read out as Loading your agents, only after 300 ms", async () => {
      vi.useFakeTimers();
      const { messenger, read } = slowMessenger();
      const { page } = await openBox(messenger);
      const skeleton = page.querySelector("[data-agent-skeleton]");

      expect(textBox(page).placeholder).toBe("Ask an agent");
      expect(document.activeElement).toBe(textBox(page));
      expect(page.querySelector("button[aria-haspopup]")).toBeNull();
      expect(skeleton?.className).toContain("invisible");
      expect(page.querySelector('[role="status"]')?.textContent).toBe("");
      await wait(300);
      expect(skeleton?.className).not.toContain("invisible");
      expect(page.querySelector('[role="status"]')?.textContent).toBe("Loading your agents");

      await typeIn(textBox(page), "Where are we?");
      expect(textBox(page).value).toBe("Where are we?");
      await press(page.querySelector('button[aria-label="Ask"]'));
      await pressKey(textBox(page), "Enter");
      expect(messenger.messagesOf.size).toBe(0);

      await act(async () => read.release());
      await settle();
      expect(textBox(page).placeholder).toBe("Ask Chief anything");
      expect(textBox(page).value).toBe("Where are we?");
      expect(page.querySelector("[data-agent-skeleton]")).toBeNull();
      expect(page.querySelector('button[aria-label="Ask Chief. Change agent."]')).not.toBeNull();
    });
  });

  describe("couldn't load the agents", () => {
    it("says so in the box instead of throwing, with Try again and Open Studio", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { messenger, read } = slowMessenger();
      const { page, window } = await openBox(messenger);
      await typeIn(textBox(page), "Where are we?");
      await act(async () => read.fail(new Error("Studio is gone")));
      await settle();
      const dialog = page.querySelector('[role="dialog"]');

      expect(dialog?.textContent).toContain("Couldn't load your agents");
      expect(dialog?.textContent).toContain("Studio didn't answer.");
      expect(page.querySelector("textarea")).toBeNull();
      await press(byText(page, "button", "Open Studio"));
      expect(window.studioShown).toBe(1);

      messenger.rowsHeld = undefined;
      await press(byText(page, "button", "Try again"));
      expect(textBox(page).placeholder).toBe("Ask Chief anything");
      expect(textBox(page).value).toBe("Where are we?");
      expect(document.activeElement).toBe(textBox(page));
    });

    it("moves the focus to its title, so it's read out and Esc still closes the box", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { messenger, read } = slowMessenger();
      const { page, window } = await openBox(messenger);
      await typeIn(textBox(page), "Where are we?");
      await act(async () => read.fail(new Error("Studio is gone")));
      await settle();

      expect(document.activeElement?.textContent).toBe("Couldn't load your agents");
      await pressKey(document.activeElement, "Escape");
      expect(window.hidden).toBe(1);
    });
  });

  describe("the picker", () => {
    it("says when no agent matches the search, and keeps the search", async () => {
      const { page } = await openBox(new FakeMessenger([chat(chief), chat(liam)]));
      await pressKey(textBox(page), "Tab");
      const search = page.querySelector<HTMLInputElement>("[data-agent-picker] input");
      const status = page.querySelector('[data-agent-picker] [role="status"]');

      expect(status?.textContent).toBe("");
      if (search === null) throw new Error("the picker isn't open");
      await typeIn(search, "zed");
      expect(page.querySelectorAll('[role="option"]')).toHaveLength(0);
      expect(status?.textContent).toBe('No agent matches "zed"');
      expect(status?.className).not.toContain("hidden");
      expect(search.value).toBe("zed");
    });
  });

  describe("Try again", () => {
    it("says Sending… without the danger edge until the question is sent", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      messenger.refuse = "offline";
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");
      messenger.refuse = undefined;
      const send = new Held();
      messenger.sendHeld = send;
      await press(byText(page, "button", "Try again"));
      const question = page.querySelector("[data-question]");

      expect(page.querySelector("[data-sending]")?.textContent).toBe("Sending…");
      expect(question?.className).not.toContain("border-danger");
      expect(byText(page, "button", "Try again")).toBeUndefined();
      await act(async () => send.release());
      await settle();
      expect(page.querySelector("[data-sending]")).toBeNull();
    });

    it("moves the focus to the text box, so Esc still closes the box", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      messenger.refuse = "offline";
      const { page, window } = await openBox(messenger);
      await ask(page, "Where are we?");
      messenger.refuse = undefined;
      messenger.sendHeld = new Held();
      const tryAgain = byText(page, "button", "Try again");
      if (!(tryAgain instanceof HTMLElement)) throw new Error("no Try again");
      tryAgain.focus();
      await press(tryAgain);

      expect(document.activeElement).toBe(textBox(page));
      await pressKey(document.activeElement, "Escape");
      expect(window.hidden).toBe(1);
    });

    it("goes back to Not sent when it fails again", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      messenger.refuse = "offline";
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");
      await press(byText(page, "button", "Try again"));

      expect(page.querySelector("[data-sending]")).toBeNull();
      expect(page.textContent).toContain("Not sent · Try again");
    });

    it("says nothing under a question on its first send", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      messenger.sendHeld = new Held();
      const { page } = await openBox(messenger);
      await ask(page, "Where are we?");

      expect(page.querySelector("[data-question]")).not.toBeNull();
      expect(page.querySelector("[data-sending]")).toBeNull();
    });
  });

  describe("Copy", () => {
    it("reads Copied with a tick for 2 s, said once to screen readers", async () => {
      const messenger = new FakeMessenger([chat(chief)]);
      const clipboard = new FakeClipboard();
      const { page } = await openBox(messenger, memoryStorage(), clipboard);
      await answered(page, messenger);
      vi.useFakeTimers();
      const copy = page.querySelector('footer button[aria-label="Copy"]');
      await press(copy);

      expect(clipboard.copied).toEqual(["With the board."]);
      expect(copy?.textContent).toBe("Copied");
      // Only the tick takes the success colour; the word keeps the link's (mockup QA8).
      expect(copy?.querySelector(".text-success svg")).not.toBeNull();
      expect(copy?.querySelector(".text-success")?.textContent).toBe("");
      expect(page.querySelector('footer [role="status"]')?.textContent).toBe("Copied");
      await wait(2000);
      expect(copy?.textContent).toBe("Copy");
      expect(page.querySelector('footer [role="status"]')?.textContent).toBe("");
    });

    it("reads Couldn't copy in the danger colour for 2 s when the clipboard refuses", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const messenger = new FakeMessenger([chat(chief)]);
      const { page } = await openBox(messenger, memoryStorage(), new FakeClipboard(true));
      await answered(page, messenger);
      vi.useFakeTimers();
      const copy = page.querySelector('footer button[aria-label="Copy"]');
      await press(copy);

      expect(copy?.textContent).toBe("Couldn't copy");
      expect(copy?.querySelector(".text-danger")).not.toBeNull();
      expect(page.querySelector('footer [role="status"]')?.textContent).toBe("Couldn't copy");
      await wait(2000);
      expect(copy?.textContent).toBe("Copy");
    });
  });

  it("keeps the unsent text from last time while the agents are read", async () => {
    const storage = memoryStorage();
    new AskMemory(storage).setUnsent("Where are we with the release?");
    const { messenger } = slowMessenger();
    const { page } = await openBox(messenger, storage);

    expect(textBox(page).value).toBe("Where are we with the release?");
  });
});
