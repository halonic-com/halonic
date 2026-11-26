import type { InboxItem } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { Messenger } from "./messenger.ts";

/** How many agents the board's Paperclip lists in these tests, each with one chat. */
const agentCount = 15;

/**
 * What one list read may ask the port, with 15 chats: the sources, the agents, the conversations
 * and the Inbox once each, and each chat's messages once.
 */
const callsPerList = 4 + agentCount;

/** A clock that moves a minute on each read, so every item has its own time. */
function ticking(): () => Date {
  let minutes = 0;
  return () => new Date(Date.UTC(2026, 10, 24, 10, minutes++));
}

/** Lets every promise that is already settled run its callbacks, with no timer. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

/** A promise and the function that settles it, as a slow Paperclip answers. */
function later<T>() {
  let answer: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

/** Acme with 15 agents, each with a chat holding one message, and a card from the first agent. */
function acmeOfFifteen() {
  const messaging = new FakeAgentMessaging({ now: ticking() });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const agents = Array.from({ length: agentCount }, (_, index) =>
    messaging.addAgent(acme.id, { name: `Agent ${index + 1}` }),
  );
  for (const agent of agents) {
    messaging.addMessage(messaging.addConversation(agent.id).id, { body: `Hi from ${agent.id}` });
  }
  const first = agents[0];
  if (first === undefined) throw new Error("no agent");
  messaging.addInboxItem(acme.id, {
    question: "Merge #12?",
    from: { kind: "agent", agent: first.id, name: "Agent 1" },
  });
  return { messaging, acme };
}

/** Counts every port call `messenger.rows()` makes, by name. */
function countCalls(messaging: FakeAgentMessaging) {
  const names = [
    "listSources",
    "listAgents",
    "listConversations",
    "listInboxItems",
    "listMessages",
  ] as const;
  return new Map(names.map((name) => [name, vi.spyOn(messaging, name)]));
}

/** The port calls made so far, in all. */
function total(calls: ReturnType<typeof countCalls>): number {
  return [...calls.values()].reduce((sum, spy) => sum + spy.mock.calls.length, 0);
}

verifies("messenger.rows-first", () => {
  describe("Messenger.rows with a slow Inbox", () => {
    it(`lists 15 chats in ${callsPerList} calls, reading every chat's messages at once and not waiting for the Inbox`, async () => {
      const { messaging } = acmeOfFifteen();
      const read = messaging.listMessages.bind(messaging);
      const calls = countCalls(messaging);
      // The Inbox doesn't answer, as a first read of every open task's cards takes 40 s.
      const inbox = later<readonly InboxItem[]>();
      calls.get("listInboxItems")?.mockReturnValue(inbox.promise);
      // Each chat's messages answer only once every chat's read has been asked for.
      const gate = later<void>();
      calls.get("listMessages")?.mockImplementation(async (conversation) => {
        await gate.promise;
        return read(conversation);
      });

      const listed = new Messenger(messaging).rows();
      await settle();
      expect(calls.get("listMessages")?.mock.calls).toHaveLength(agentCount);
      gate.answer();
      const rows = await listed;

      expect(rows).toHaveLength(agentCount);
      expect(rows.every((row) => row.last?.body.startsWith("Hi from") === true)).toBe(true);
      expect(rows.every((row) => row.openCards === 0)).toBe(true);
      expect(total(calls)).toBe(callsPerList);
      expect([...calls].map(([name, spy]) => [name, spy.mock.calls.length])).toEqual([
        ["listSources", 1],
        ["listAgents", 1],
        ["listConversations", 1],
        ["listInboxItems", 1],
        ["listMessages", agentCount],
      ]);
    });

    it("reads the list again when the Inbox answers late with a card, and then shows its dot", async () => {
      const { messaging, acme } = acmeOfFifteen();
      const cards = await messaging.listInboxItems();
      const inbox = later<readonly InboxItem[]>();
      vi.spyOn(messaging, "listInboxItems").mockReturnValueOnce(inbox.promise);
      const messenger = new Messenger(messaging);
      const heard = vi.fn();
      const stop = messenger.watch(heard);

      const first = await messenger.rows();
      expect(first.some((row) => (row.openCards ?? 0) > 0)).toBe(false);
      inbox.answer(cards);
      await settle();
      expect(heard).toHaveBeenCalledWith(acme.id);

      const again = await messenger.rows();
      expect(again.filter((row) => row.openCards === 1)).toHaveLength(1);
      stop();
    });

    it("doesn't read the list again when the late Inbox holds what the list showed", async () => {
      const { messaging } = acmeOfFifteen();
      const inbox = later<readonly InboxItem[]>();
      vi.spyOn(messaging, "listInboxItems").mockReturnValueOnce(inbox.promise);
      const messenger = new Messenger(messaging);
      const heard = vi.fn();
      const stop = messenger.watch(heard);

      await messenger.rows();
      inbox.answer([]);
      await settle();
      expect(heard).not.toHaveBeenCalled();
      stop();
    });

    it("reads the Inbox once for the list, Needs you and a channel's questions together", async () => {
      const { messaging } = acmeOfFifteen();
      const listInbox = vi.spyOn(messaging, "listInboxItems");
      const messenger = new Messenger(messaging);
      const rows = await Promise.all([messenger.rows(), messenger.questions()]).then(
        ([read]) => read,
      );
      expect(listInbox).toHaveBeenCalledOnce();
      const waiting = await Promise.all([messenger.needsYou(rows), messenger.questions()]);
      expect(waiting[0]).toHaveLength(1);
      expect(listInbox).toHaveBeenCalledTimes(2);
    });

    it("still lists the chats, with no dots, when the Inbox can't be read", async () => {
      const { messaging } = acmeOfFifteen();
      vi.spyOn(messaging, "listInboxItems").mockRejectedValue(new Error("offline"));
      const failed = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const rows = await new Messenger(messaging).rows();
      await settle();
      expect(rows).toHaveLength(agentCount);
      expect(rows.every((row) => row.openCards === 0)).toBe(true);
      expect(failed).toHaveBeenCalledOnce();
      failed.mockRestore();
    });
  });
});
