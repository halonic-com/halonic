import {
  agentMessagingVersion,
  type MessagingId,
  type SyncBatch,
  type SyncChange,
  type SyncCollection,
} from "@halonicjs/ports";
import { readStored, storeFormat } from "./stored-collection.ts";
import type { SyncPersistence } from "./sync-persistence.ts";

/** The most items one collection keeps; the ones a collection lists first are kept. */
export const keptItemsMax = 5000;

/** What every collection of one source shares. */
export interface KeptCollectionOptions {
  source: MessagingId;
  persistence: SyncPersistence;
  /** Says why a saved collection was read as missing, so it isn't dropped silently. */
  warn: (message: string) => void;
  /** For tests; {@link keptItemsMax} by default. */
  itemsMax?: number;
}

/**
 * One collection of the local copy: its items in memory, its watermark and the mapping version
 * they were made with, saved after every change. The saved copy is read once, on first use, so
 * a restart serves what was kept before the source answers.
 */
export class KeptCollection<Item extends { id: MessagingId }> {
  readonly #collection: SyncCollection<Item>;
  readonly #options: KeptCollectionOptions;
  /** In the order the collection gave them; `undefined` until one read or a saved copy. */
  #items: Item[] | undefined;
  #asOf: string | undefined;
  #mapping: string | undefined;
  #opened: Promise<void> | undefined;

  constructor(collection: SyncCollection<Item>, options: KeptCollectionOptions) {
    this.#collection = collection;
    this.#options = options;
  }

  /** The kept items, or `undefined` before the first read when nothing was saved either. */
  async items(): Promise<readonly Item[] | undefined> {
    await this.#open();
    return this.#items;
  }

  /**
   * Reads what changed (everything, before the first read or after a mapping change) and keeps
   * it. A failed read throws and leaves the kept items as they were.
   *
   * @returns whether the kept items changed
   */
  async sync(): Promise<boolean> {
    await this.#open();
    const batch = await this.#collection.read(this.#change());
    const items = this.#applied(batch);
    const changed =
      this.#items === undefined || JSON.stringify(items) !== JSON.stringify(this.#items);
    const moved =
      changed || batch.asOf !== this.#asOf || this.#mapping !== this.#collection.mapping;
    this.#items = items;
    this.#asOf = batch.asOf;
    this.#mapping = this.#collection.mapping;
    if (moved) await this.#save();
    return changed;
  }

  /**
   * Replaces the kept item `id` with what `change` makes of it, as a write the source accepted
   * says it is now, so the next read needn't wait for a sync.
   *
   * @returns whether an item `id` was kept
   */
  async update(id: MessagingId, change: (item: Item) => Item): Promise<boolean> {
    await this.#open();
    const items = this.#items;
    if (items === undefined || !items.some((item) => item.id === id)) return false;
    this.#items = items.map((item) => (item.id === id ? change(item) : item));
    await this.#save();
    return true;
  }

  /** Forgets what is kept in memory; the source's saved records are deleted by its store. */
  forget(): void {
    this.#items = undefined;
    this.#asOf = undefined;
    this.#mapping = undefined;
    this.#opened = Promise.resolve();
  }

  #change(): SyncChange {
    const asOf = this.#asOf;
    if (asOf === undefined || this.#mapping !== this.#collection.mapping) return { kind: "all" };
    return { kind: "since", asOf };
  }

  #applied(batch: SyncBatch<Item>): Item[] {
    const itemsMax = this.#options.itemsMax ?? keptItemsMax;
    if (batch.kind === "all") return batch.items.slice(0, itemsMax);
    const replaced = new Map(batch.items.map((item) => [item.id, item]));
    const left = new Set([...batch.removed, ...replaced.keys()]);
    const kept = (this.#items ?? []).filter((item) => !left.has(item.id));
    return [...replaced.values(), ...kept].slice(0, itemsMax);
  }

  /** Reads the saved copy once; a failed read is tried again on the next use. */
  #open(): Promise<void> {
    this.#opened ??= this.#load().catch((error: unknown) => {
      this.#opened = undefined;
      throw error;
    });
    return this.#opened;
  }

  async #load(): Promise<void> {
    const { persistence, source, warn } = this.#options;
    const name = this.#collection.name;
    const saved = await persistence.load(name);
    if (saved === undefined) return;
    const read = readStored<Item>(saved, source);
    if (read.kind === "missing") {
      warn(`The local copy's ${name} collection was read as missing: ${read.why}.\n`);
      return;
    }
    // A copy made by an older mapping is still made of port types: it is served until a read replaces it.
    this.#items = [...read.stored.items];
    this.#asOf = read.stored.asOf;
    this.#mapping = read.stored.mapping;
  }

  async #save(): Promise<void> {
    const { persistence, source } = this.#options;
    const [items, asOf, mapping] = [this.#items, this.#asOf, this.#mapping];
    if (items === undefined || asOf === undefined || mapping === undefined) return;
    await persistence.save(this.#collection.name, {
      store: storeFormat,
      port: agentMessagingVersion,
      mapping,
      source,
      asOf,
      items,
    });
  }
}
