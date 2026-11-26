import type { AgentMessaging, MessagingId, MessagingSync, SyncCollection } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakeScheduler } from "./fake-scheduler.test-helper.ts";
import { StoredAgentMessaging } from "./stored-agent-messaging.ts";
import type { StoredCollection } from "./stored-collection.ts";
import type { SyncPersistence } from "./sync-persistence.ts";
import { SyncScheduler } from "./sync-scheduler.ts";

/** Saved records in memory, as the host's files would hold them. */
class MemoryPersistence implements SyncPersistence {
  readonly records = new Map<string, unknown>();

  async load(name: string): Promise<unknown> {
    return structuredClone(this.records.get(name));
  }

  async save(name: string, stored: StoredCollection<unknown>): Promise<void> {
    this.records.set(name, structuredClone(stored));
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

/** The fake's lists as collections that always answer everything, as a first full load does. */
function wholeLists(live: AgentMessaging): MessagingSync {
  const collection = <Item extends { id: MessagingId }>(
    name: string,
    list: () => Promise<readonly Item[]>,
  ): SyncCollection<Item> => ({
    name,
    mapping: "1",
    read: async () => ({
      kind: "all",
      items: await list(),
      removed: [],
      asOf: "2026-11-26T10:00:00.000Z",
    }),
  });
  return {
    agents: collection("agents", () => live.listAgents()),
    conversations: collection("conversations", () => live.listConversations()),
    inbox: collection("inbox", () => live.listInboxItems()),
    work: collection("work", () => live.listWork()),
  };
}

/** Lets every promise that is already settled run its callbacks; no time passes. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

verifies("agent-host.paperclip-polling", () => {
  it("emits nothing on the change feed for a poll that finds no change, and the source for one that does", async () => {
    const fake = new FakeAgentMessaging();
    const source = fake.addSource({ label: "Acme" });
    fake.addInboxItem(source.id, { question: "Ship the release?" });
    const stored = new StoredAgentMessaging({
      live: fake,
      sync: wholeLists(fake),
      source: source.id,
      persistence: new MemoryPersistence(),
      warn: () => {},
    });
    const scheduler = new FakeScheduler("2026-11-26T10:00:00.000Z");
    const sync = new SyncScheduler({
      scheduler,
      clock: scheduler.clock,
      poll: () => stored.refresh(),
    });
    scheduler.listen({
      onTimer: async (timer) => void (await sync.onTimer(timer)),
      onTick: async () => {},
    });
    const seen: MessagingId[] = [];
    const reader = stored.changes()[Symbol.asyncIterator]();
    const read = (async () => {
      for (let next = await reader.next(); next.done !== true; next = await reader.next()) {
        seen.push(next.value);
      }
    })();
    await sync.start();
    await scheduler.pass(0);
    await settle();
    expect(seen).toEqual([source.id]);

    await scheduler.pass(10_000);
    await settle();
    expect(seen).toEqual([source.id]);

    fake.addInboxItem(source.id, { question: "Merge the fix?" });
    await scheduler.pass(10_000);
    await settle();
    expect(seen).toEqual([source.id, source.id]);
    await reader.return?.();
    await read;
  });
});
