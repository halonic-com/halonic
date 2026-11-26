// @vitest-environment jsdom
import type { Conversation, Message, MessagingId, SendResult } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findInChat, openChat, openMessenger, settle, typeAndSend } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

/** Chief's chat: "Morning" from Chief at 9:00, then the board's "Thanks" at 9:05. */
function chiefsChat(conversation: Partial<Conversation> = {}) {
  const clock = { now: new Date(2026, 10, 25, 9, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id, conversation);
  messaging.addMessage(chat.id, { body: "Morning" });
  clock.now = new Date(2026, 10, 25, 9, 5);
  const thanks = messaging.addMessage(chat.id, { author: { kind: "me" }, body: "Thanks" });
  return { messaging, clock, source, chat, thanks };
}

const noon = () => new Date(2026, 10, 25, 12, 0);

/** From now on the source reads the chat with `patch`, and says it changed. */
async function sourceSays(
  messaging: FakeAgentMessaging,
  source: MessagingId,
  chat: MessagingId,
  patch: Partial<Conversation>,
): Promise<void> {
  const list = messaging.listConversations.bind(messaging);
  vi.spyOn(messaging, "listConversations").mockImplementation(async () =>
    (await list()).map((each) => (each.id === chat ? { ...each, ...patch } : each)),
  );
  await act(async () => messaging.goOnline(source));
  await settle();
}

/** From now on the source gives `message` the `readAt` time, and says it changed. */
async function readBySource(
  messaging: FakeAgentMessaging,
  source: MessagingId,
  message: MessagingId,
  readAt: Date,
): Promise<void> {
  const list = messaging.listMessages.bind(messaging);
  vi.spyOn(messaging, "listMessages").mockImplementation(async (conversation) =>
    (await list(conversation)).map(
      (each): Message => (each.id === message ? { ...each, readAt: readAt.toISOString() } : each),
    ),
  );
  await act(async () => messaging.goOnline(source));
  await settle();
}

function typingLine(page: HTMLElement): string | null | undefined {
  return page.querySelector("main [data-typing]")?.textContent;
}

/** The ticks under the person's message that holds `body`. */
function ticksOf(page: HTMLElement, body: string): Element | null | undefined {
  const bubble = [...page.querySelectorAll('main li[data-author="me"]')].find((each) =>
    each.textContent?.includes(body),
  );
  return bubble?.querySelector("[data-ticks]");
}

verifies("messenger.typing", () => {
  describe("the typing line", () => {
    it("says Chief is typing… while Chief's run on the chat goes on, and goes once it ends", async () => {
      const { messaging, source, chat } = chiefsChat({ agentWorking: true });
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      expect(typingLine(page)).toBe("Chief is typing…");
      // Its status region is there before and after, so a screen reader hears it come.
      expect(page.querySelector("main [data-typing]")?.closest('[role="status"]')).not.toBeNull();
      await sourceSays(messaging, source.id, chat.id, { agentWorking: false });
      expect(typingLine(page)).toBeUndefined();
    });

    it("goes once Chief replies, even while its run goes on", async () => {
      const { messaging, clock, chat } = chiefsChat({ agentWorking: true });
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      clock.now = new Date(2026, 10, 25, 9, 6);
      await act(async () => void messaging.addMessage(chat.id, { body: "On it" }));
      await settle();
      expect(typingLine(page)).toBeUndefined();
    });

    it("shows nothing while Chief has no run, or while the board searches", async () => {
      const idle = chiefsChat();
      const page = await openMessenger(idle.messaging, [], false, noon);
      await openChat(page, "Chief");
      expect(typingLine(page)).toBeUndefined();
      unmountAll();
      const working = chiefsChat({ agentWorking: true });
      const searched = await openMessenger(working.messaging, [], false, noon);
      await openChat(searched, "Chief");
      await findInChat(searched, "Thanks");
      expect(typingLine(searched)).toBeUndefined();
    });

    it("pulses its three dots only when motion is allowed", async () => {
      const { messaging } = chiefsChat({ agentWorking: true });
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      const dots = [...(page.querySelector("main [data-typing] [aria-hidden]")?.children ?? [])];
      expect(dots).toHaveLength(3);
      for (const dot of dots) {
        const classes = dot.className.split(" ");
        expect(classes).toContain("motion-safe:animate-typing");
        expect(classes).not.toContain("animate-typing");
      }
    });
  });
});

verifies("messenger.read-receipts", () => {
  describe("the ticks", () => {
    it("show one tick for a sent message and two once Chief picked it up", async () => {
      const { messaging, source, thanks } = chiefsChat();
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Chief");
      const sent = ticksOf(page, "Thanks");
      expect(sent?.querySelectorAll("svg")).toHaveLength(1);
      expect(sent?.querySelector(".sr-only")?.textContent).toBe("Sent");
      expect(sent?.parentElement?.parentElement?.textContent).toContain("09:05");
      await readBySource(messaging, source.id, thanks.id, new Date(2026, 10, 25, 9, 7));
      const read = ticksOf(page, "Thanks");
      expect(read?.querySelectorAll("svg")).toHaveLength(2);
      expect(read?.querySelector(".sr-only")?.textContent).toBe("Read 09:07");
      // The same words as a tooltip, which screen readers skip: they heard them already.
      const tooltip = page.querySelector('main [role="tooltip"]');
      expect(tooltip?.textContent).toBe("Read 09:07");
      expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
    });

    it("show no tick while the message is Sending…, and one once it was sent", async () => {
      const { messaging } = chiefsChat();
      const send = messaging.send.bind(messaging);
      let land = () => undefined as unknown;
      vi.spyOn(messaging, "send").mockImplementation(
        (...args) => new Promise<SendResult>((done) => (land = () => done(send(...args)))),
      );
      const page = await openMessenger(messaging, [], false, noon);
      const box = await openChat(page, "Chief");
      await typeAndSend(box, "On it");
      expect(page.querySelector("[data-pending]")?.textContent).toContain("Sending…");
      expect(page.querySelector("[data-pending] [data-ticks]")).toBeNull();
      await act(async () => void land());
      await settle();
      expect(ticksOf(page, "On it")?.getAttribute("data-ticks")).toBe("sent");
    });

    it("leave a channel's messages to their work lines", async () => {
      const clock = { now: new Date(2026, 10, 25, 9, 0) };
      const messaging = new FakeAgentMessaging({ now: () => clock.now });
      const source = messaging.addSource({ label: "Paperclip · Acme" });
      const chief = messaging.addAgent(source.id, { name: "Chief" });
      const mara = messaging.addAgent(source.id, { name: "Mara" });
      const channel = messaging.addConversation(chief.id, {
        title: "Launch",
        members: [chief.id, mara.id],
      });
      messaging.addMessage(channel.id, { author: { kind: "me" }, body: "Ship it" });
      const page = await openMessenger(messaging, [], false, noon);
      await openChat(page, "Launch");
      expect(page.querySelector('main li[data-author="me"]')?.textContent).toContain("Ship it");
      expect(page.querySelector("main [data-ticks]")).toBeNull();
    });
  });
});
