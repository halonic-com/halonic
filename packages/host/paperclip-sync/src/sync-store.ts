import type {
  Conversation,
  InboxItem,
  MessagingAgent,
  MessagingSync,
  WorkItem,
} from "@halonicjs/ports";
import { KeptCollection, type KeptCollectionOptions } from "./kept-collection.ts";

/**
 * One source's local copy (requirement `agent-host.paperclip-sync`): a kept collection for each
 * list the provider's {@link MessagingSync} gives, read together, so a provider that reads its
 * source once for several lists does so once per sync.
 */
export class SyncStore {
  readonly agents: KeptCollection<MessagingAgent>;
  readonly conversations: KeptCollection<Conversation>;
  readonly inbox: KeptCollection<InboxItem>;
  readonly work: KeptCollection<WorkItem>;
  readonly #options: KeptCollectionOptions;
  /** The sync in flight, which a second caller joins instead of starting its own. */
  #syncing: Promise<boolean> | undefined;

  constructor(sync: MessagingSync, options: KeptCollectionOptions) {
    this.#options = options;
    this.agents = new KeptCollection(sync.agents, options);
    this.conversations = new KeptCollection(sync.conversations, options);
    this.inbox = new KeptCollection(sync.inbox, options);
    this.work = new KeptCollection(sync.work, options);
  }

  /**
   * Reads every collection at once. When one fails, the others still keep what they read, and
   * the first failure is thrown.
   *
   * @returns whether any collection changed
   */
  sync(): Promise<boolean> {
    this.#syncing ??= this.#syncOnce().finally(() => {
      this.#syncing = undefined;
    });
    return this.#syncing;
  }

  /**
   * As {@link sync}, but every read starts after this call: a sync already in flight, which may
   * have read before something changed, is waited out first, whatever it ends in. A failure is
   * thrown, as {@link sync} throws it.
   *
   * @returns whether any collection changed
   */
  async syncAfter(): Promise<boolean> {
    await this.#syncing?.catch(() => undefined);
    return this.sync();
  }

  /**
   * Closes every collection, waits for the saves already started, then deletes the source's saved
   * copy, as Disconnect does. A sync or a write still in flight then saves nothing, so the copy
   * can't come back; the store keeps nothing more.
   */
  async clear(): Promise<void> {
    await Promise.all(this.#all().map((kept) => kept.close()));
    await this.#options.persistence.clear();
  }

  async #syncOnce(): Promise<boolean> {
    const settled = await Promise.allSettled(this.#all().map((kept) => kept.sync()));
    const failed = settled.find((result) => result.status === "rejected");
    if (failed !== undefined) throw failed.reason;
    return settled.some((result) => result.status === "fulfilled" && result.value);
  }

  #all(): readonly Pick<KeptCollection<{ id: string }>, "sync" | "close">[] {
    return [this.agents, this.conversations, this.inbox, this.work];
  }
}
