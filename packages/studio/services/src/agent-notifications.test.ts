import type { AgentMessaging, MessagingId } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  type AgentNotice,
  type NoticeTarget,
  type Notifier,
  watchAgentNotifications,
} from "./agent-notifications.ts";

/** Keeps every notice with its click, and lets a test wait for the next one. */
class RecordingNotifier implements Notifier {
  readonly shown: { notice: AgentNotice; click: () => void }[] = [];
  #waiting: (() => void) | undefined;

  show(notice: AgentNotice, onClick: () => void): Promise<void> {
    this.shown.push({ notice, click: onClick });
    this.#waiting?.();
    return Promise.resolve();
  }

  /** Resolves once `count` notices have been shown. */
  async until(count: number): Promise<void> {
    while (this.shown.length < count) {
      await new Promise<void>((resolve) => {
        this.#waiting = resolve;
      });
    }
  }

  reasons(): string[] {
    return this.shown.map((each) => each.notice.reason);
  }
}

/** A watch on a fake with one source and one agent, Chief, started and ready. */
async function started() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const notifier = new RecordingNotifier();
  const opened: NoticeTarget[] = [];
  const errors: unknown[] = [];
  const answer = vi.spyOn(messaging, "answer");
  const send = vi.spyOn(messaging, "send");
  const watch = watchAgentNotifications(messaging, notifier, {
    open: (target) => opened.push(target),
    onError: (error) => errors.push(error),
  });
  await watch.ready;
  return { messaging, source, chief, notifier, opened, errors, answer, send, watch };
}

verifies("services.agent-notifications", () => {
  describe("watchAgentNotifications", () => {
    it("shows one notification for a new card", async () => {
      const { messaging, source, notifier, watch } = await started();
      const card = messaging.addInboxItem(source.id, {
        question: "Ship the release?\nDetails follow.",
        from: { kind: "person", name: "Liam" },
      });
      await notifier.until(1);
      await watch.stop();
      expect(notifier.shown.map((each) => each.notice)).toEqual([
        {
          reason: "card",
          title: "New card from Liam",
          body: "Ship the release?",
          target: { kind: "inbox-item", id: card.id },
        },
      ]);
    });

    it("shows one notification for a new question, and none for a plain reply", async () => {
      const { messaging, source, chief, notifier, watch } = await started();
      const chat = messaging.addConversation(chief.id);
      messaging.addMessage(chat.id, { body: "Which branch?" });
      await notifier.until(1);
      messaging.addMessage(chat.id, { body: "Also, which day?" });
      messaging.addMessage(chat.id, { body: "Main, today", author: { kind: "me" } });
      // A card after them, so the test knows every change before it was read.
      messaging.addInboxItem(source.id, { question: "Last", from: { kind: "me" } });
      await notifier.until(2);
      await watch.stop();
      expect(notifier.reasons()).toEqual(["question", "card"]);
      expect(notifier.shown[0]?.notice).toEqual({
        reason: "question",
        title: "Chief is waiting for you",
        body: "",
        target: { kind: "conversation", id: chat.id },
      });
      expect(notifier.shown[1]?.notice.title).toBe("New card from you");
    });

    it("shows one notification for done work the person asked for, and none for other done work", async () => {
      const { messaging, source, notifier, watch } = await started();
      const asked = messaging.addWork(source.id, { label: "HAL-1", title: "Fix the build" });
      messaging.addInboxItem(source.id, {
        question: "Fix the build?",
        work: asked.id,
        state: {
          kind: "answered",
          by: { kind: "me" },
          answer: { kind: "option", option: "yes" },
          answeredAt: "2026-11-24T10:00:00.000Z",
        },
      });
      messaging.addInboxItem(source.id, {
        question: "About no work",
        state: {
          kind: "answered",
          by: { kind: "me" },
          answer: { kind: "reply", text: "Fine" },
          answeredAt: "2026-11-24T10:00:00.000Z",
        },
      });
      messaging.addInboxItem(source.id, { question: "First" });
      await notifier.until(1);
      // The fake has no way to change work, so the same ID again, done, stands in for the move.
      messaging.addWork(source.id, {
        label: "HAL-1",
        title: "Fix the build",
        state: "done",
        id: asked.id,
      });
      messaging.addWork(source.id, { label: "HAL-2", title: "Not asked", state: "done" });
      await notifier.until(2);
      // Work that stays done shows nothing more.
      messaging.addInboxItem(source.id, { question: "Last" });
      await notifier.until(3);
      await watch.stop();
      expect(notifier.reasons()).toEqual(["card", "done", "card"]);
      expect(notifier.shown[1]?.notice).toEqual({
        reason: "done",
        title: "Done: HAL-1",
        body: "Fix the build",
        target: { kind: "work", id: asked.id },
      });
    });

    it("opens the item on a click and neither answers nor sends", async () => {
      const { messaging, source, notifier, opened, answer, send, watch } = await started();
      const card = messaging.addInboxItem(source.id, { question: "Ship it?" });
      await notifier.until(1);
      await watch.stop();
      notifier.shown[0]?.click();
      expect(opened).toEqual([{ kind: "inbox-item", id: card.id }]);
      expect(answer).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it("shows nothing for what is there when it starts", async () => {
      const messaging = new FakeAgentMessaging();
      const source = messaging.addSource({ label: "Paperclip · Acme" });
      messaging.addInboxItem(source.id, { question: "Old card" });
      const notifier = new RecordingNotifier();
      const watch = watchAgentNotifications(messaging, notifier, {
        open: vi.fn(),
        onError: vi.fn(),
      });
      await watch.ready;
      messaging.addInboxItem(source.id, { question: "New card" });
      await notifier.until(1);
      await watch.stop();
      expect(notifier.shown.map((each) => each.notice.body)).toEqual(["New card"]);
    });

    it("reports a failed read and a refused notification, and goes on", async () => {
      const { messaging, source, notifier, errors, watch } = await started();
      const failure = new Error("source broke");
      const listInboxItems = vi.spyOn(messaging, "listInboxItems").mockRejectedValueOnce(failure);
      vi.spyOn(notifier, "show")
        .mockRejectedValueOnce("refused")
        .mockImplementation(RecordingNotifier.prototype.show.bind(notifier));
      // The first change's read fails; the next one finds all three cards.
      messaging.addInboxItem(source.id, { question: "One" });
      messaging.addInboxItem(source.id, { question: "Two" });
      messaging.addInboxItem(source.id, { question: "Three" });
      await notifier.until(2);
      await watch.stop();
      expect(listInboxItems).toHaveBeenCalled();
      expect(errors).toEqual([failure, "refused"]);
      expect(notifier.shown).toHaveLength(2);
    });

    it("starts from the first read that works when the first one fails", async () => {
      const changes = queueOf(["a", "b"]);
      const listInboxItems = vi
        .fn<AgentMessaging["listInboxItems"]>()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          {
            id: "card",
            source: "a",
            from: { kind: "person", name: "Liam" },
            question: "Ship?",
            options: [],
            attachments: [],
            createdAt: "2026-11-24T10:00:00.000Z",
            state: { kind: "open" },
          },
        ]);
      const messaging = {
        listInboxItems,
        listConversations: () => Promise.resolve([]),
        listWork: () => Promise.resolve([]),
        changes: () => changes,
      } as unknown as AgentMessaging;
      const notifier = new RecordingNotifier();
      const onError = vi.fn();
      const watch = watchAgentNotifications(messaging, notifier, { open: vi.fn(), onError });
      await notifier.until(1);
      await watch.stop();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(notifier.reasons()).toEqual(["card"]);
    });
  });
});

/** Changes that end after `ids`, from an iterator with no `return`. */
function queueOf(ids: MessagingId[]): AsyncIterable<MessagingId> {
  const left = [...ids];
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => {
        const value = left.shift();
        return Promise.resolve(
          value === undefined ? { done: true, value: undefined } : { done: false, value },
        );
      },
    }),
  };
}
