import type {
  Conversation,
  InboxItem,
  MessagingAgent,
  MessagingId,
  MessagingSync,
  SyncCollection,
  WorkItem,
} from "@halonicjs/ports";

/**
 * The version of what this provider's mappers give. Bump it when a mapper changes its output,
 * so a local copy made by the old one is read whole again.
 */
export const paperclipMappingVersion = "1";

/** One read of every list the local copy keeps, in the port's types. */
export interface PaperclipLists {
  agents: readonly MessagingAgent[];
  conversations: readonly Conversation[];
  inbox: readonly InboxItem[];
  work: readonly WorkItem[];
  /** Paperclip's time of the newest task change read, or the time of the read before any task. */
  asOf: string;
}

/**
 * The connection's collections for the engine's local copy (`agent-host.paperclip-sync`). All
 * four share one read of the lists while it is in flight, so a sync reads the open tasks once.
 * Each answers `all`: the task list behind them already reads only what changed since its own
 * watermark (`paperclip-client.delta-reads`), and the cards only of the tasks that changed.
 */
export function paperclipSync(read: () => Promise<PaperclipLists>): MessagingSync {
  let reading: Promise<PaperclipLists> | undefined;
  const shared = (): Promise<PaperclipLists> => {
    reading ??= read().finally(() => {
      reading = undefined;
    });
    return reading;
  };
  const collection = <Item extends { id: MessagingId }>(
    name: string,
    pick: (lists: PaperclipLists) => readonly Item[],
  ): SyncCollection<Item> => ({
    name,
    mapping: paperclipMappingVersion,
    read: async () => {
      const lists = await shared();
      return { kind: "all", items: pick(lists), removed: [], asOf: lists.asOf };
    },
  });
  return {
    agents: collection("agents", (lists) => lists.agents),
    conversations: collection("conversations", (lists) => lists.conversations),
    inbox: collection("inbox", (lists) => lists.inbox),
    work: collection("work", (lists) => lists.work),
  };
}
