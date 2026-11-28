// @vitest-environment jsdom

import {
  gatewayReactionsProtocolVersion,
  type Message,
  type MessageReaction,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayScene } from "../test-support/gateway-scene.ts";
import {
  answer,
  buttonNamed,
  line,
  openChannel,
  openChat,
  settle,
} from "../test-support/phone-messenger-scene.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { LONG_PRESS_MS } from "./phone-reactions.tsx";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
});

const yesterday = "2026-11-24T09:00:00.000Z";
const elena = { kind: "agent", agent: "elena", name: "Elena" } as const;

/** Elena's "Morning" from yesterday, then the person's "Thanks", in the channel. */
const messages: readonly Message[] = [
  {
    id: "m2",
    conversation: "c1",
    author: { kind: "me" },
    body: "Thanks",
    attachments: [],
    sentAt: yesterday,
  },
  {
    id: "m1",
    conversation: "c1",
    author: elena,
    body: "Morning",
    attachments: [],
    sentAt: yesterday,
  },
];

/** The person's 👍, from the computer (A1.4), and Liam's 👀 (an agent's, A3.2), on "Morning". */
const onMorning: readonly MessageReaction[] = [
  { emoji: "👍", by: { kind: "me" }, at: yesterday },
  { emoji: "👀", by: { kind: "agent", agent: "liam", name: "Liam" }, at: yesterday },
];

/** The channel open on the phone, its reactions read. */
async function openReacted(): Promise<GatewayScene> {
  const { scene } = await openChannel(messages);
  answer(scene, "reactions", [{ message: "m1", reactions: onMorning }]);
  await settle();
  return scene;
}

function messageLi(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`li[data-message-id="${id}"]`);
}

/** Each chip under message `id`: what it shows, pressed or not. */
function chipsUnder(id: string): string[] {
  return [...(messageLi(id)?.querySelectorAll("[data-chip]") ?? [])].map((chip) => {
    const shown = chip.querySelector("[aria-hidden]")?.textContent ?? "";
    return chip.getAttribute("aria-pressed") === "true" ? `${shown} (mine)` : shown;
  });
}

/** A pointer event of `type` from a finger (or `kind`) at `x`, `y`, on message `id`'s text. */
function pointer(id: string, type: string, x = 10, y = 10, kind = "touch") {
  const target = messageLi(id)?.querySelector("p, [data-chat-message]") ?? messageLi(id);
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerType", { value: kind });
  act(() => {
    target?.dispatchEvent(event);
  });
}

/** Rests a finger on message `id` for `ms`, moving it by `drift` px first. */
function rest(id: string, { ms = LONG_PRESS_MS, drift = 0, kind = "touch" } = {}) {
  vi.useFakeTimers();
  pointer(id, "pointerdown", 10, 10, kind);
  if (drift > 0) pointer(id, "pointermove", 10, 10 + drift, kind);
  act(() => vi.advanceTimersByTime(ms));
  vi.useRealTimers();
}

/** Message `id`'s chip of `emoji`: jsdom's selectors miss emoji in attribute values. */
function chip(id: string, emoji: string): HTMLElement | undefined {
  return [...(messageLi(id)?.querySelectorAll<HTMLElement>("[data-chip]") ?? [])].find(
    (each) => each.getAttribute("data-chip") === emoji,
  );
}

const sheet = () => document.querySelector("dialog[open]");
const sheetTitle = () => sheet()?.querySelector("h2")?.textContent;

verifies("remote.phone-reactions", () => {
  describe("reactions in a chat on the phone", () => {
    it("shows the computer's reactions under yesterday's message as 32 px chips (A2.1, A3.2)", async () => {
      await openReacted();
      expect(chipsUnder("m1")).toEqual(["👍 1 (mine)", "👀 1"]);
      const eyes = chip("m1", "👀");
      expect(eyes?.className).toContain("h-8");
      expect(eyes?.className).not.toContain("bg-accent-soft");
      expect(eyes?.querySelector(".sr-only")?.textContent).toBe("Eyes, 1: Liam");
      expect(eyes?.querySelector("[aria-hidden] span")?.className).toContain("text-[16px]");
    });

    it("opens the sheet on a half-second rest of a finger, for an agent's and the person's own (A2.2)", async () => {
      await openReacted();
      rest("m1", { ms: LONG_PRESS_MS - 1 });
      expect(sheet()).toBeNull();
      pointer("m1", "pointerup");
      rest("m1");
      expect(sheetTitle()).toBe("React to Elena's message");
      expect(sheet()?.querySelector("[data-pressed-message]")?.textContent).toBe("Morning");
      const six = [...(sheet()?.querySelectorAll("button[aria-pressed]") ?? [])];
      expect(six.map((each) => each.textContent)).toEqual(["👍", "❤️", "😂", "😮", "✅", "👀"]);
      expect(six.every((each) => each.className.includes("h-12"))).toBe(true);
      expect(six[0]?.getAttribute("aria-pressed")).toBe("true");
      expect(buttonNamed("Copy text")).toBeDefined();
      await act(async () => buttonNamed("Close")?.click());
      rest("m2");
      expect(sheetTitle()).toBe("React to your message");
    });

    it("reacts from the sheet, closes it and shows the chip at once (A2.3)", async () => {
      const scene = await openReacted();
      rest("m1");
      await act(async () => buttonNamed("Heart")?.click());
      expect(sheet()).toBeNull();
      expect(chipsUnder("m1")).toEqual(["👍 1 (mine)", "❤️ 1 (mine)", "👀 1"]);
      expect(scene.tunnel.lastOf("msg-react")).toMatchObject({
        conversation: "c1",
        message: "m1",
        emoji: "❤️",
        on: true,
      });
    });

    it("copies the message's text and closes the sheet (A2.4)", async () => {
      const writeText = vi.fn(async (_text: string) => undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      await openReacted();
      rest("m1");
      await act(async () => buttonNamed("Copy text")?.click());
      await settle();
      expect(writeText).toHaveBeenCalledWith("Morning");
      expect(sheet()).toBeNull();
    });

    it("opens nothing for a finger that moved, or for a mouse (A2.5)", async () => {
      await openReacted();
      rest("m1", { drift: 20 });
      expect(sheet()).toBeNull();
      rest("m1", { kind: "mouse" });
      expect(sheet()).toBeNull();
    });

    it("toggles the person's own on a tap of its chip, without the sheet (A2.6)", async () => {
      const scene = await openReacted();
      await act(async () => chip("m1", "👍")?.click());
      expect(sheet()).toBeNull();
      expect(chipsUnder("m1")).toEqual(["👀 1"]);
      expect(scene.tunnel.lastOf("msg-react")).toMatchObject({ emoji: "👍", on: false });
    });

    it("puts only that emoji back and says so when the computer refuses the save", async () => {
      const scene = await openReacted();
      rest("m1");
      await act(async () => buttonNamed("Heart")?.click());
      scene.host({
        type: "error",
        replyTo: scene.tunnel.lastOf("msg-react").id,
        code: "not-found",
      });
      await settle();
      expect(chipsUnder("m1")).toEqual(["👍 1 (mine)", "👀 1"]);
      expect(line()).toBe("Couldn't save the reaction. Try again.");
    });

    it("keeps a later saved reaction when an earlier one, still saving, is refused", async () => {
      const scene = await openReacted();
      rest("m1");
      await act(async () => buttonNamed("Heart")?.click());
      const heart = scene.tunnel.lastOf("msg-react").id;
      await act(async () => chip("m1", "👀")?.click());
      const eyes = { emoji: "👀", by: { kind: "me" }, at: yesterday } as const;
      scene.host({
        type: "msg-result",
        replyTo: scene.tunnel.lastOf("msg-react").id,
        result: { outcome: "saved", reactions: [...onMorning, eyes] },
      });
      await settle();
      scene.host({ type: "error", replyTo: heart, code: "not-found" });
      await settle();
      expect(chipsUnder("m1")).toEqual(["👍 1 (mine)", "👀 2 (mine)"]);
    });

    it("says so and keeps the sheet open when the clipboard refuses the text", async () => {
      const writeText = vi.fn(async (_text: string) => {
        throw new DOMException("Write permission denied.", "NotAllowedError");
      });
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
      await openReacted();
      rest("m1");
      await act(async () => buttonNamed("Copy text")?.click());
      await settle();
      expect(writeText).toHaveBeenCalledWith("Morning");
      expect(sheetTitle()).toBe("React to Elena's message");
      expect(sheet()?.querySelector('[role="status"]')?.textContent).toBe(
        "Couldn't copy the text.",
      );
    });

    it("opens the sheet on a finger's context menu, and not on a mouse's", async () => {
      await openReacted();
      pointer("m1", "pointerdown", 10, 10, "mouse");
      pointer("m1", "contextmenu", 10, 10, "mouse");
      expect(sheet()).toBeNull();
      pointer("m1", "pointerdown");
      pointer("m1", "contextmenu");
      expect(sheetTitle()).toBe("React to Elena's message");
    });

    it("opens the sheet on a pen's rest, as on a finger's", async () => {
      await openReacted();
      rest("m1", { kind: "pen" });
      expect(sheetTitle()).toBe("React to Elena's message");
    });

    it("reads every page of the chat's reactions", async () => {
      const { scene } = await openChannel(messages);
      const first = scene.tunnel.sentOf("msg-read").findLast((each) => each.what === "reactions");
      scene.host({
        type: "msg-data",
        replyTo: first?.id ?? "",
        what: "reactions",
        items: [{ message: "m2", reactions: [onMorning[1]] }],
        more: "40",
      });
      await settle();
      answer(scene, "reactions", [{ message: "m1", reactions: onMorning }]);
      await settle();
      expect(scene.tunnel.sentOf("msg-read").at(-1)).toMatchObject({ cursor: "40" });
      expect(chipsUnder("m2")).toEqual(["👀 1"]);
      expect(chipsUnder("m1")).toEqual(["👍 1 (mine)", "👀 1"]);
    });

    it("shows the chat as before when the computer's source keeps no reactions", async () => {
      const { scene } = await openChannel(messages);
      const read = scene.tunnel.sentOf("msg-read").findLast((each) => each.what === "reactions");
      scene.host({ type: "error", replyTo: read?.id ?? "", code: "not-supported" });
      await settle();
      expect(messageLi("m1")?.textContent).toContain("Morning");
      expect(document.querySelector("[data-reactions]")).toBeNull();
      rest("m1");
      expect(sheet()).toBeNull();
    });

    it("shows the chat as before on a computer that speaks version 4 (A2.7)", async () => {
      const { scene } = await openChat(
        "Engineering",
        messages,
        gatewayReactionsProtocolVersion - 1,
      );
      expect(messageLi("m1")?.textContent).toContain("Morning");
      expect(scene.tunnel.sentOf("msg-read").map((read) => read.what)).not.toContain("reactions");
      expect(document.querySelector("[data-reactions]")).toBeNull();
      rest("m1");
      expect(sheet()).toBeNull();
    });
  });
});
