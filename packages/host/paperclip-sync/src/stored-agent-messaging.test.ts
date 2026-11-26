import type {
  AgentMessaging,
  InboxItem,
  MessagingId,
  MessagingSync,
  SyncBatch,
  SyncChange,
  SyncCollection,
} from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { StoredAgentMessaging } from "./stored-agent-messaging.ts";
import type { StoredCollection } from "./stored-collection.ts";
import type { SyncPersistence } from "./sync-persistence.ts";

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

/** A provider's collections over the fake's lists, counting each read and the change it asked. */
class CountedSync {
  readonly asked: SyncChange[] = [];
  mapping = "1";
  /** When set, the next inbox read answers this batch instead of the whole list. */
  nextInbox: SyncBatch<InboxItem> | undefined;
  /** When set, each read lists the fake's items, then waits for it before it answers. */
  held: Promise<void> | undefined;
  readonly #live: AgentMessaging;

  constructor(live: AgentMessaging) {
    this.#live = live;
  }

  sync(): MessagingSync {
    return {
      agents: this.#collection("agents", () => this.#live.listAgents()),
      conversations: this.#collection("conversations", () => this.#live.listConversations()),
      inbox: this.#collection(
        "inbox",
        () => this.#live.listInboxItems(),
        () => this.#takeInbox(),
      ),
      work: this.#collection("work", () => this.#live.listWork()),
    };
  }

  #takeInbox(): SyncBatch<InboxItem> | undefined {
    const batch = this.nextInbox;
    this.nextInbox = undefined;
    return batch;
  }

  #collection<Item extends { id: MessagingId }>(
    name: string,
    list: () => Promise<readonly Item[]>,
    next: () => SyncBatch<Item> | undefined = () => undefined,
  ): SyncCollection<Item> {
    const counted = this;
    return {
      name,
      get mapping() {
        return counted.mapping;
      },
      read: async (change) => {
        this.asked.push(change);
        const asOf = "2026-11-26T08:00:00.000Z";
        const batch = next() ?? { kind: "all", items: await list(), removed: [], asOf };
        await this.held;
        return batch;
      },
    };
  }
}

function acmeSource() {
  const fake = new FakeAgentMessaging();
  const source = fake.addSource({ label: "Acme" });
  const ada = fake.addAgent(source.id, { name: "Ada" });
  const chat = fake.addConversation(ada.id);
  const card = fake.addInboxItem(source.id, { question: "Ship the release?" });
  fake.addWork(source.id, { label: "ACME-7", title: "Release" });
  return { fake, source: source.id, chat, card };
}

/** Counts every read the fake answers, so a test can show the store asked it nothing. */
function counted(fake: FakeAgentMessaging): { live: AgentMessaging; reads: string[] } {
  const reads: string[] = [];
  const live = new Proxy(fake, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") return value;
      return (...args: unknown[]) => {
        reads.push(property);
        return value.apply(target, args);
      };
    },
  });
  return { live, reads };
}

/** Waits until all four collections have started their held read, so it predates what follows. */
async function untilReading(sync: CountedSync): Promise<void> {
  const before = sync.asked.length;
  for (let turn = 0; turn < 100; turn += 1) {
    if (sync.asked.length >= before + 4) return;
    await Promise.resolve();
  }
  throw new Error("the sync never started reading");
}

function storedOver(
  live: AgentMessaging,
  source: MessagingId,
  persistence = new MemoryPersistence(),
  itemsMax?: number,
) {
  const sync = new CountedSync(live);
  const warned: string[] = [];
  const stored = new StoredAgentMessaging({
    live,
    sync: sync.sync(),
    source,
    persistence,
    warn: (message) => warned.push(message),
    ...(itemsMax === undefined ? {} : { itemsMax }),
  });
  return { stored, sync, persistence, warned };
}

verifies("agent-host.paperclip-sync", () => {
  describe("reads from the local copy", () => {
    it("answers agents, conversations, inbox items and work without asking the provider after one sync", async () => {
      const { fake, source } = acmeSource();
      const { live, reads } = counted(fake);
      const { stored } = storedOver(live, source);
      await stored.refresh();
      reads.length = 0;

      expect(await stored.listInboxItems()).toHaveLength(1);
      expect(await stored.listConversations()).toHaveLength(1);
      expect(await stored.listAgents()).toHaveLength(1);
      expect(await stored.listWork()).toHaveLength(1);

      expect(reads).toEqual([]);
    });

    it("asks the provider itself before the first sync", async () => {
      const { fake, source } = acmeSource();
      const { live, reads } = counted(fake);
      const { stored } = storedOver(live, source);

      expect(await stored.listInboxItems()).toHaveLength(1);
      expect(reads).toEqual(["listInboxItems"]);
    });

    it("still searches through the provider, which also finds closed work", async () => {
      const { fake, source } = acmeSource();
      const { live, reads } = counted(fake);
      const { stored } = storedOver(live, source);
      await stored.refresh();
      reads.length = 0;

      const hits = await stored.search("Release");

      expect(reads).toEqual(["search"]);
      expect(hits.length).toBeGreaterThan(0);
    });

    it("drops an item a changed batch removes, such as a task that closed", async () => {
      const { fake, source, card } = acmeSource();
      const { stored, sync } = storedOver(fake, source);
      await stored.refresh();
      sync.nextInbox = {
        kind: "changed",
        items: [],
        removed: [card.id],
        asOf: "2026-11-26T09:00:00.000Z",
      };

      await stored.refresh();

      expect(await stored.listInboxItems()).toEqual([]);
      expect(sync.asked.at(-2)).toEqual({ kind: "since", asOf: "2026-11-26T08:00:00.000Z" });
    });
  });

  describe("a sync in flight", () => {
    it("keeps an answer accepted while a sync that read the card before it was still reading", async () => {
      const { fake, source, card } = acmeSource();
      const { stored, sync } = storedOver(fake, source);
      await stored.refresh();
      let release = () => {};
      sync.held = new Promise((resolve) => {
        release = resolve;
      });
      const reading = stored.refresh();
      await untilReading(sync);

      await stored.answer(card.id, { kind: "option", option: "yes" });
      release();
      await reading;

      const [kept] = await stored.listInboxItems();
      expect(kept?.state).toMatchObject({ kind: "answered", by: { kind: "me" } });
    });

    it("writes nothing after clear, when a sync that was reading ends", async () => {
      const { fake, source } = acmeSource();
      const { stored, sync, persistence } = storedOver(fake, source);
      let release = () => {};
      sync.held = new Promise((resolve) => {
        release = resolve;
      });
      const reading = stored.refresh();
      await untilReading(sync);

      await stored.clear();
      release();
      await reading;

      expect(persistence.records.size).toBe(0);
    });

    it("asks for every item again after the cap cut a changed batch", async () => {
      const { fake, source, card } = acmeSource();
      const { stored, sync } = storedOver(fake, source, new MemoryPersistence(), 1);
      await stored.refresh();
      const other = { ...card, id: "card-2" };
      const asOf = "2026-11-26T09:00:00.000Z";
      sync.nextInbox = { kind: "changed", items: [other], removed: [], asOf };
      await stored.refresh();
      sync.asked.length = 0;

      await stored.refresh();

      expect(sync.asked).toContainEqual({ kind: "all" });
    });
  });

  describe("writes", () => {
    it("sends an answer to the provider and keeps the item answered at once", async () => {
      const { fake, source, card } = acmeSource();
      const { stored } = storedOver(fake, source);
      await stored.refresh();

      const result = await stored.answer(card.id, { kind: "option", option: "yes" });

      expect(result.outcome).toBe("answered");
      const [kept] = await stored.listInboxItems();
      expect(kept?.state).toMatchObject({ kind: "answered", by: { kind: "me" } });
    });

    it("moves a conversation to the message just sent", async () => {
      const { fake, source, chat } = acmeSource();
      const { stored } = storedOver(fake, source);
      await stored.refresh();

      const result = await stored.send(chat.id, "Ship it");

      if (result.outcome !== "sent") throw new Error("the fake refused the message");
      const [kept] = await stored.listConversations();
      expect(kept?.updatedAt).toBe(result.message.sentAt);
    });
  });

  describe("changes", () => {
    it("names the source only when a sync changed the store", async () => {
      const { fake, source } = acmeSource();
      const { stored } = storedOver(fake, source);
      const changes = stored.changes()[Symbol.asyncIterator]();
      await stored.refresh();
      await stored.refresh();
      fake.addWork(source, { label: "ACME-8", title: "Notes" });
      await stored.refresh();

      expect(await changes.next()).toEqual({ done: false, value: source });
      expect(await changes.next()).toEqual({ done: false, value: source });
      await changes.return?.();
    });
  });

  describe("the saved copy", () => {
    it("is served after a restart before the provider answers", async () => {
      const { fake, source } = acmeSource();
      const { stored, persistence } = storedOver(fake, source);
      await stored.refresh();
      const { live, reads } = counted(fake);

      const restarted = storedOver(live, source, persistence).stored;

      expect(await restarted.listInboxItems()).toHaveLength(1);
      expect(reads).toEqual([]);
    });

    it("is read whole again after a mapping change, and served meanwhile", async () => {
      const { fake, source } = acmeSource();
      const { stored, persistence } = storedOver(fake, source);
      await stored.refresh();
      const restarted = storedOver(fake, source, persistence);
      restarted.sync.mapping = "2";

      expect(await restarted.stored.listWork()).toHaveLength(1);
      await restarted.stored.refresh();

      expect(restarted.sync.asked).toContainEqual({ kind: "all" });
      expect(restarted.sync.asked).not.toContainEqual(expect.objectContaining({ kind: "since" }));
    });

    it("counts as missing when another port version made it, and says so", async () => {
      const { fake, source } = acmeSource();
      const { stored, persistence } = storedOver(fake, source);
      await stored.refresh();
      const saved = persistence.records.get("inbox") as Record<string, unknown>;
      persistence.records.set("inbox", { ...saved, port: 1 });
      const { live, reads } = counted(fake);
      const restarted = storedOver(live, source, persistence);

      expect(await restarted.stored.listInboxItems()).toHaveLength(1);
      expect(reads).toEqual(["listInboxItems"]);
      expect(restarted.warned.join("")).toContain("another port");
    });

    it("is deleted by clear, and reads go to the provider again", async () => {
      const { fake, source } = acmeSource();
      const { live, reads } = counted(fake);
      const { stored, persistence } = storedOver(live, source);
      await stored.refresh();

      await stored.clear();
      reads.length = 0;
      await stored.listInboxItems();

      expect(persistence.records.size).toBe(0);
      expect(reads).toEqual(["listInboxItems"]);
    });
  });
});
