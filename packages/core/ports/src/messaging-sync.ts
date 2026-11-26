import type {
  Conversation,
  InboxItem,
  MessagingAgent,
  MessagingId,
  WorkItem,
} from "./agent-messaging.ts";

/**
 * Version of the {@link MessagingSync} port. A breaking change bumps it and comes with an ADR.
 * Version 1: a provider's collections, read whole or as the changes after a watermark.
 */
export const messagingSyncVersion = 1;

/** What a sync asks a collection for: every item, or only what changed after its watermark. */
export type SyncChange = { kind: "all" } | { kind: "since"; asOf: string };

/** What one read of a collection gave, already in the port's types. */
export interface SyncBatch<Item> {
  /**
   * `all`: `items` is the whole collection and replaces what the store keeps. `changed`: `items`
   * are added or replace the kept ones with the same ID, and the items named in `removed` leave.
   * A collection may answer a `since` change with `all`, never an `all` change with `changed`.
   */
  kind: "all" | "changed";
  items: readonly Item[];
  /** Only for `changed`: the IDs of items that left the source, such as a task that closed. */
  removed: readonly MessagingId[];
  /**
   * The source's time of the newest change the read saw, never the reader's own clock. The store
   * keeps it as the collection's watermark and hands it back in the next `since` change.
   */
  asOf: string;
}

/**
 * One kind of data a provider keeps current in the engine's local copy, such as its inbox items
 * (requirement `agent-host.paperclip-sync`). The provider reads its source and converts each
 * record into the port's types before it returns, so the store never holds a provider's shape.
 */
export interface SyncCollection<Item extends { id: MessagingId }> {
  /** Its name in the store, such as "inbox"; one file each. */
  readonly name: string;
  /**
   * The provider's mapping version. When it differs from the one the store's copy was made with,
   * the store keeps serving that copy and asks the collection for `all` once.
   */
  readonly mapping: string;
  /** Reads the source. Fails when the source can't be read; the store then keeps what it had. */
  read(change: SyncChange): Promise<SyncBatch<Item>>;
}

/**
 * What a provider hands the engine's sync (port `MessagingSync`): one collection for each list
 * the store answers in place of the provider. Conversations' messages and search stay live reads.
 */
export interface MessagingSync {
  agents: SyncCollection<MessagingAgent>;
  conversations: SyncCollection<Conversation>;
  inbox: SyncCollection<InboxItem>;
  work: SyncCollection<WorkItem>;
}
