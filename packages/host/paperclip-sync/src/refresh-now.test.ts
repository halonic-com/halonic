import type { InboxItem, MessagingId, MessagingSync, SyncCollection } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { StoredAgentMessaging } from "./stored-agent-messaging.ts";
import type { SyncPersistence } from "./sync-persistence.ts";
import { SyncStore } from "./sync-store.ts";

const source = "acme";
const asOf = "2026-11-27T09:00:00.000Z";

/** Nothing saved: these tests read only what the store holds in memory. */
const persistence: SyncPersistence = {
  load: async () => undefined,
  save: async () => {},
  clear: async () => {},
};

/** An invented Acme approval asking `question`. */
function item(question: string): InboxItem {
  return {
    id: "acme:approval:1",
    source,
    from: { kind: "agent", agent: "acme:ada", name: "Ada" },
    question,
    options: [{ id: "approve", label: "Approve" }],
    risk: "risky",
    attachments: [],
    createdAt: asOf,
    state: { kind: "open" },
  };
}

/** A collection that lists nothing. */
function empty<Item extends { id: MessagingId }>(name: string): SyncCollection<Item> {
  return { name, mapping: "1", read: async () => ({ kind: "all", items: [], removed: [], asOf }) };
}

/**
 * The source's collections, whose inbox answers what `inbox` holds when its read starts, then
 * waits for `held` and fails when `failing` is set by then.
 */
function acmeSync() {
  const state = {
    inbox: [item("Hire Iris")] as readonly InboxItem[],
    held: undefined as Promise<void> | undefined,
    failing: false,
    reads: 0,
  };
  const sync: MessagingSync = {
    agents: empty("agents"),
    conversations: empty("conversations"),
    work: empty("work"),
    inbox: {
      name: "inbox",
      mapping: "1",
      read: async () => {
        state.reads += 1;
        const items = state.inbox;
        await state.held;
        if (state.failing) throw new Error("Paperclip answered 503");
        return { kind: "all", items, removed: [], asOf };
      },
    },
  };
  return { state, sync };
}

const options = { source, persistence, warn: () => {} };

verifies("agent-host.risky-answer-confirm", () => {
  describe("a read that starts now", () => {
    it("waits out a sync that began before the change, then reads again", async () => {
      const { state, sync } = acmeSync();
      const store = new SyncStore(sync, options);
      let release = () => {};
      state.held = new Promise((resolve) => {
        release = resolve;
      });
      const earlier = store.sync();
      await Promise.resolve();
      state.inbox = [item("Hire Iris with ACME_ROOT_TOKEN")];

      const now = store.syncAfter();
      release();
      await Promise.all([earlier, now]);

      expect(state.reads).toBe(2);
      expect((await store.inbox.items())?.[0]?.question).toBe("Hire Iris with ACME_ROOT_TOKEN");
    });

    it("throws when its read fails, and keeps the old copy", async () => {
      const { state, sync } = acmeSync();
      const store = new SyncStore(sync, options);
      await store.sync();
      state.failing = true;

      await expect(store.syncAfter()).rejects.toThrow("503");
      expect((await store.inbox.items())?.[0]?.question).toBe("Hire Iris");
    });

    it("throws, unlike refresh, when the source may not be read or its read fails", async () => {
      const { state, sync } = acmeSync();
      let mayRead = true;
      const stored = new StoredAgentMessaging({
        ...options,
        live: new FakeAgentMessaging(),
        sync,
        mayRead: async () => mayRead,
      });
      await stored.refreshNow();
      state.failing = true;
      await expect(stored.refreshNow()).rejects.toThrow("503");
      mayRead = false;
      await expect(stored.refreshNow()).rejects.toThrow();
      await expect(stored.refresh()).resolves.toBeUndefined();
    });
  });
});
