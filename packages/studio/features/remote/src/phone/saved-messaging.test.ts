import type {
  Conversation,
  InboxItem,
  Message,
  MessagingId,
  MessagingSource,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeSavedDataStore } from "../test-support/fake-saved-data-store.ts";
import type { ComputerId } from "./phone-tunnel.ts";
import {
  maxSavedBytes,
  maxSavedMessages,
  SavedMessaging,
  type SavedMessagingData,
} from "./saved-messaging.ts";

const laptop = "c-1" as ComputerId;
const clock = () => new Date("2026-11-26T14:02:00.000Z");

function source(id: MessagingId): MessagingSource {
  return {
    id,
    provider: "paperclip",
    label: `Paperclip · ${id}`,
    state: { kind: "online", asOf: "2026-11-26T14:00:00.000Z" },
  };
}

function conversation(id: MessagingId, from: MessagingId, updatedAt: string): Conversation {
  return { id, source: from, agent: "lead", title: id, updatedAt, waitingForMe: false };
}

function message(
  conversationId: MessagingId,
  index: number,
  body = `Note ${index}`,
  sentAt = "2026-11-26T13:00:00.000Z",
): Message {
  return {
    id: `${conversationId}-m${index}`,
    conversation: conversationId,
    author: { kind: "agent", agent: "lead", name: "Lead" },
    body,
    attachments: [],
    sentAt,
  };
}

function inboxItem(id: MessagingId, from: MessagingId): InboxItem {
  return {
    id,
    source: from,
    from: { kind: "agent", agent: "lead", name: "Lead" },
    question: "Ship the launch post?",
    options: [{ id: "yes", label: "Yes" }],
    attachments: [],
    createdAt: "2026-11-26T12:00:00.000Z",
    state: { kind: "open" },
  };
}

function setUp() {
  const store = new FakeSavedDataStore();
  const saved = new SavedMessaging(store, laptop, clock);
  const savedText = (): SavedMessagingData => JSON.parse(store.texts.get(laptop) ?? "null");
  return { store, saved, savedText };
}

verifies("remote.phone-saved-messaging", () => {
  describe("what the phone saves", () => {
    it("saves the lists it read with the time it saw them, and reads them back", async () => {
      const { store, saved } = setUp();
      const launch = conversation("c1", "acme", "2026-11-26T13:00:00.000Z");
      await saved.sawSources([source("acme")]);
      await saved.sawInbox([inboxItem("i1", "acme")]);
      await saved.sawConversations([launch]);
      await saved.sawMessages(launch, [message("c1", 1)]);
      await saved.setDraft(launch, "Looks good, ship");

      const reopened = new SavedMessaging(store, laptop, clock);
      const data = await reopened.load();
      expect(data.asOf).toBe("2026-11-26T14:02:00.000Z");
      expect(data.inbox.map((item) => item.id)).toEqual(["i1"]);
      expect(data.opened[0]?.messages.map((saved) => saved.id)).toEqual(["c1-m1"]);
      expect(data.drafts).toEqual([
        { source: "acme", conversation: "c1", text: "Looks good, ship" },
      ]);
    });

    it("keeps the newest 200 messages of a conversation", async () => {
      const { saved } = setUp();
      const newestFirst = Array.from({ length: 250 }, (_, index) => message("c1", 250 - index));
      await saved.sawMessages(conversation("c1", "acme", "2026-11-26T13:00:00.000Z"), newestFirst);
      const kept = saved.data.opened[0]?.messages ?? [];
      expect(kept).toHaveLength(maxSavedMessages);
      expect(kept[0]?.id).toBe("c1-m250");
      expect(kept.at(-1)?.id).toBe("c1-m51");
    });

    it("saves only lists, messages and drafts: no activity, team status, key or session", async () => {
      const { saved, savedText } = setUp();
      await saved.sawSources([source("acme")]);
      expect(Object.keys(savedText()).sort()).toEqual(
        ["asOf", "conversations", "drafts", "inbox", "opened", "sources", "version"].sort(),
      );
      // Nothing in its interface takes agents, work, team status, a key or a session.
      const methods = Object.getOwnPropertyNames(SavedMessaging.prototype).sort();
      expect(methods).toEqual(
        [
          "constructor",
          "data",
          "forget",
          "load",
          "queue",
          "save",
          "sawConversations",
          "sawInbox",
          "sawMessages",
          "sawSources",
          "setDraft",
        ].sort(),
      );
    });

    it("deletes text it can't read", async () => {
      const { store, saved } = setUp();
      store.texts.set(laptop, "{not saved data");
      expect((await saved.load()).inbox).toEqual([]);
      expect(store.cleared).toEqual([laptop]);
    });
  });

  describe("what clears it", () => {
    it("Forget deletes everything saved for the computer", async () => {
      const { store, saved } = setUp();
      await saved.sawInbox([inboxItem("i1", "acme")]);
      await saved.forget();
      expect(store.texts.has(laptop)).toBe(false);
      expect(saved.data.inbox).toEqual([]);
    });

    it("a source that leaves the list takes its lists, messages and drafts along", async () => {
      const { saved, savedText } = setUp();
      const kept = conversation("c1", "acme", "2026-11-26T13:00:00.000Z");
      const gone = conversation("c2", "globex", "2026-11-26T13:00:00.000Z");
      await saved.sawSources([source("acme"), source("globex")]);
      await saved.sawInbox([inboxItem("i1", "acme"), inboxItem("i2", "globex")]);
      await saved.sawConversations([kept, gone]);
      await saved.sawMessages(gone, [message("c2", 1)]);
      await saved.setDraft(gone, "Draft for globex");

      await saved.sawSources([source("acme")]);
      const text = savedText();
      expect(text.inbox.map((item) => item.id)).toEqual(["i1"]);
      expect(text.conversations.map((item) => item.id)).toEqual(["c1"]);
      expect(text.opened).toEqual([]);
      expect(text.drafts).toEqual([]);
      expect(JSON.stringify(text)).not.toContain("globex");
    });
  });

  it("past 20 MB it drops the oldest conversations first", async () => {
    const { store, saved } = setUp();
    // About 1.8 MB a conversation, so 15 of them pass 20 MB.
    const body = "x".repeat(9000);
    // Saved newest first, so the order they came in doesn't decide which go.
    for (let day = 24; day >= 10; day -= 1) {
      const id = `day-${day}`;
      const sentAt = `2026-11-${day}T09:00:00.000Z`;
      const messages = Array.from({ length: maxSavedMessages }, (_, index) =>
        message(id, index, body, sentAt),
      );
      await saved.sawMessages(conversation(id, "acme", sentAt), messages);
    }
    const text = store.texts.get(laptop) ?? "";
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(maxSavedBytes);
    const kept = saved.data.opened.map((entry) => entry.conversation);
    expect(kept).not.toContain("day-10");
    expect(kept).toContain("day-24");
    // Only the oldest went: what stays is a run of the newest days.
    const days = kept.map((id) => Number(id.slice(4))).sort((left, right) => left - right);
    expect(days.at(-1)).toBe(24);
    expect(days.length).toBe(24 - (days[0] ?? 0) + 1);
  });
});
