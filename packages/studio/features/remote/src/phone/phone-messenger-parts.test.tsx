// @vitest-environment jsdom

import type { Message } from "@halonicjs/ports";
import { SKELETON_AFTER_MS, STILL_LOADING_AFTER_MS } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agents,
  answer,
  buttonNamed,
  channel,
  direct,
  line,
  message,
  openChannel,
  openChat,
  renderMessenger,
  rowNamed,
  settle,
  type,
} from "../test-support/phone-messenger-scene.tsx";
import { unmountAll } from "../test-support/render.tsx";

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
});

const paperclip = { id: "acme", provider: "paperclip", label: "Paperclip · Halonic" };
const online = { ...paperclip, state: { kind: "online" } };

/** A message of the person's own in the channel. */
function mine(body: string): Message {
  return { ...message(body), id: "m0", author: { kind: "me" } };
}

/** Presses `key` in the chat's box. */
function press(key: string, shiftKey = false) {
  act(() => {
    const box = document.querySelector("textarea");
    box?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
  });
}

/** The rows of the box's list of members. */
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

verifies("remote.phone-messenger", () => {
  describe("the phone's chat rows (p02b)", () => {
    it("shows the picture, name · source, the time and the second line", async () => {
      const { scene } = renderMessenger();
      answer(scene, "conversations", [{ ...direct, agentWorking: true }, channel]);
      answer(scene, "agents", agents);
      answer(scene, "sources", [online]);
      await settle();
      const chief = rowNamed("Chief");
      // Elena's initial on her own tint: the row's picture, which a screen reader skips.
      expect(chief?.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
      expect(chief?.firstElementChild?.textContent).toBe("E");
      expect(chief?.textContent).toContain("Chief · Paperclip · Halonic");
      expect(chief?.querySelector("time")?.dateTime).toBe(direct.updatedAt);
      expect(chief?.textContent).toContain("Working…");
      // A channel shows its size in the source's place, and its dot while it waits.
      expect(rowNamed("Engineering")?.textContent).toContain("Engineering · 2 agents");
      expect(rowNamed("Engineering")?.textContent).toContain(", needs you");
    });

    it("says Draft: for text left in a chat's box", async () => {
      const { scene } = await openChat("Chief");
      type("Ship it\nand tell Liam");
      await act(async () => buttonNamed("Messenger")?.click());
      answer(scene, "conversations", [{ ...direct, agentWorking: true }]);
      await settle();
      expect(rowNamed("Chief")?.textContent).toContain("Draft: Ship it");
      expect(rowNamed("Chief")?.textContent).not.toContain("Working…");
    });

    it("shows skeleton rows while the chats load, then says when none waits", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      const { scene } = renderMessenger();
      act(() => vi.advanceTimersByTime(SKELETON_AFTER_MS));
      expect(document.querySelector('[aria-busy="true"] ul')).not.toBeNull();
      expect(document.body.textContent).toContain("Loading Messenger");
      vi.useRealTimers();
      answer(scene, "conversations", [{ ...direct, waitingForMe: false }]);
      answer(scene, "agents", agents);
      await settle();
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();
      const chips = [...document.querySelectorAll<HTMLLabelElement>('[role="radiogroup"] label')];
      await act(async () => chips[1]?.querySelector("input")?.click());
      expect(document.body.textContent).toContain("Nothing is waiting for you.");
    });

    it("says No chats yet for an empty list", async () => {
      const { scene } = renderMessenger();
      answer(scene, "conversations", []);
      answer(scene, "agents", []);
      await settle();
      expect(document.body.textContent).toContain("No chats yet");
    });
    it("reads the chats again from Try again under Still loading, though nothing failed", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout"] });
      const { scene } = renderMessenger();
      const reads = (what: string) =>
        scene.tunnel.sentOf("msg-read").filter((read) => read.what === what);
      act(() => vi.advanceTimersByTime(STILL_LOADING_AFTER_MS));
      expect(document.body.textContent).toContain("Still loading");
      await act(async () => buttonNamed("Try again")?.click());
      expect(reads("conversations")).toHaveLength(2);
      expect(reads("agents")).toHaveLength(2);
    });

    it("says no No chats yet beside a re-read that failed", async () => {
      const { scene } = await openChat("Chief");
      await act(async () => buttonNamed("Messenger")?.click());
      const reads = scene.tunnel.sentOf("msg-read").filter((read) => read.what === "conversations");
      scene.host({ type: "error", replyTo: reads.at(-1)?.id ?? "", code: "signed-out" });
      answer(scene, "agents", agents);
      await settle();
      expect(document.body.textContent).toContain("turned it down");
      expect(document.body.textContent).not.toContain("No chats yet");
      // Try again loads again until the computer answers: the list failed empty, it isn't empty.
      await act(async () => buttonNamed("Try again")?.click());
      expect(document.body.textContent).not.toContain("No chats yet");
      expect(document.querySelector('[role="radiogroup"]')).toBeNull();
      answer(scene, "conversations", [direct]);
      await settle();
      expect(rowNamed("Chief")).toBeDefined();
    });

    it("keeps no draft of a message the computer took after its chat closed", async () => {
      const { scene } = await openChat("Chief");
      type("Ship it");
      press("Enter");
      await act(async () => buttonNamed("Messenger")?.click());
      const sent = scene.tunnel.sentOf("msg-send").at(-1);
      scene.host({
        type: "msg-result",
        replyTo: sent?.id ?? "",
        result: { outcome: "sent", message: { ...mine("Ship it"), conversation: "c2" } },
      });
      answer(scene, "conversations", [direct]);
      await settle();
      expect(rowNamed("Chief")?.textContent).not.toContain("Draft:");
      await act(async () => rowNamed("Chief")?.click());
      expect(document.querySelector("textarea")?.value).toBe("");
    });

    it("shows a message still on its way as Sending… in a chat opened again, never as a draft", async () => {
      const { scene } = await openChat("Chief");
      type("Ship it");
      press("Enter");
      await act(async () => buttonNamed("Messenger")?.click());
      answer(scene, "conversations", [direct]);
      await settle();
      expect(rowNamed("Chief")?.textContent).not.toContain("Draft:");
      await act(async () => rowNamed("Chief")?.click());
      expect(line()).toBe("Sending…");
      // Send waits for the answer: a second tap sends nothing.
      press("Enter");
      expect(scene.tunnel.sentOf("msg-send")).toHaveLength(1);
      const sent = scene.tunnel.sentOf("msg-send").at(-1);
      scene.host({
        type: "msg-result",
        replyTo: sent?.id ?? "",
        result: { outcome: "sent", message: { ...mine("Ship it"), conversation: "c2" } },
      });
      await settle();
      expect(line()).toBe("");
      expect(document.querySelector("textarea")?.value).toBe("");
      await act(async () => buttonNamed("Messenger")?.click());
      answer(scene, "conversations", [direct]);
      await settle();
      expect(rowNamed("Chief")?.textContent).not.toContain("Draft:");
    });

    it("gives a chat opened again while its message is on its way the send's line", async () => {
      const { scene } = await openChat("Chief");
      type("Ship it");
      press("Enter");
      await act(async () => buttonNamed("Messenger")?.click());
      answer(scene, "conversations", [direct]);
      await settle();
      await act(async () => rowNamed("Chief")?.click());
      scene.drop();
      scene.connect();
      await settle();
      expect(line()).toContain("Send it again only if it didn't.");
      expect(document.querySelector("textarea")?.value).toBe("Ship it");
      expect(scene.tunnel.sentOf("msg-send")).toHaveLength(1);
    });

    it("keeps a send's line with its text when the chat closes and opens again", async () => {
      const { scene } = await openChat("Chief");
      type("Ship it");
      press("Enter");
      await act(async () => buttonNamed("Messenger")?.click());
      // The drop cuts off the send and the list's reads alike: Try again reads the list again.
      scene.drop();
      scene.connect();
      await settle();
      await act(async () => buttonNamed("Try again")?.click());
      answer(scene, "conversations", [direct]);
      answer(scene, "agents", agents);
      await settle();
      expect(rowNamed("Chief")?.textContent).toContain("Draft: Ship it");
      await act(async () => rowNamed("Chief")?.click());
      expect(document.querySelector("textarea")?.value).toBe("Ship it");
      expect(line()).toContain("Send it again only if it didn't.");
      expect(scene.tunnel.sentOf("msg-send")).toHaveLength(1);
    });
  });

  describe("a chat on the phone (p04a, k16b)", () => {
    it("heads a chat with the picture, the name and the status line", async () => {
      const { scene } = renderMessenger();
      answer(scene, "conversations", [direct, channel]);
      answer(scene, "agents", agents);
      answer(scene, "sources", [online]);
      await settle();
      await act(async () => rowNamed("Chief")?.click());
      expect(document.querySelector("header")?.textContent).toContain(
        "ChiefPaperclip · Halonic · Working",
      );
      await act(async () => buttonNamed("Messenger")?.click());
      answer(scene, "conversations", [direct, channel]);
      await settle();
      await act(async () => rowNamed("Engineering")?.click());
      expect(document.querySelector("header")?.textContent).toContain("Elena (lead) · Liam");
    });

    it("shows a reply as a ChatMessage headed with the agent's name, after a day line", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date(channel.updatedAt) });
      await openChannel([message("Merged."), mine("Ship it")]);
      const reply = document.querySelector('[data-chat-message="reply"]');
      expect(reply?.querySelector("h3")?.textContent).toBe("Elena");
      expect(reply?.textContent).toContain("Merged.");
      const yours = document.querySelector('[data-chat-message="you"]');
      expect(yours?.textContent).toBe("Ship it");
      expect(document.querySelector("[data-day]")?.textContent).toBe("Today");
    });

    it("writes in the kit's ChatComposer: Enter sends, Shift Enter doesn't", async () => {
      const { scene } = await openChat("Chief");
      expect(document.querySelector("textarea")?.placeholder).toBe("Message Chief…");
      type("Ship it");
      press("Enter", true);
      expect(scene.tunnel.sentOf("msg-send")).toEqual([]);
      press("Enter");
      expect(scene.tunnel.sentOf("msg-send")).toEqual([
        expect.objectContaining({ conversation: "c2", body: "Ship it" }),
      ]);
    });

    it("opens the members on @ and ticks a member already named", async () => {
      await openChannel();
      expect(document.body.textContent).toContain("To Elena (lead) · Type @ to ask someone else");
      type("@");
      expect(options().map((option) => option.textContent)).toEqual(["ElenaLead", "Liam"]);
      await act(async () => options()[1]?.click());
      expect(document.querySelector("textarea")?.value).toBe("");
      expect(document.body.textContent).toContain("To Liam");
      type("@");
      const liam = options()[1];
      expect(liam?.querySelector('[data-named="true"] svg')).not.toBeNull();
      expect(options()[0]?.querySelector("svg")).toBeNull();
    });

    it("tells a screen reader the To line after each pick", async () => {
      await openChannel();
      const said = () => document.querySelector('[role="status"].sr-only')?.textContent;
      type("@");
      await act(async () => options()[1]?.click());
      expect(said()).toBe("To Liam");
      type("@");
      await act(async () => options()[1]?.click());
      expect(said()).toBe("To Elena (lead) · Type @ to ask someone else");
    });

    it("tells a screen reader the same To line again for the next message", async () => {
      const { scene } = await openChannel();
      const said = () => document.querySelector('[role="status"].sr-only')?.textContent;
      type("@");
      await act(async () => options()[1]?.click());
      type("Ship it");
      press("Enter");
      const sent = scene.tunnel.sentOf("msg-send").at(-1);
      scene.host({
        type: "msg-result",
        replyTo: sent?.id ?? "",
        result: { outcome: "sent", message: mine("Ship it") },
      });
      await settle();
      expect(said()).toBe("");
      type("@");
      await act(async () => options()[1]?.click());
      expect(said()).toBe("To Liam");
    });

    it("says Sending… while a message is on its way", async () => {
      const { scene } = await openChat("Chief");
      type("Ship it");
      press("Enter");
      expect(line()).toBe("Sending…");
      const sent = scene.tunnel.sentOf("msg-send").at(-1);
      scene.host({
        type: "msg-result",
        replyTo: sent?.id ?? "",
        result: { outcome: "sent", message: { ...mine("Ship it"), conversation: "c2" } },
      });
      await settle();
      expect(line()).toBe("");
    });
  });
});
