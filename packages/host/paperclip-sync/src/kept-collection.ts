import {
  agentMessagingVersion,
  type MessagingId,
  type SyncBatch,
  type SyncChange,
  type SyncCollection,
} from "@halonicjs/ports";
import { readStored, storeFormat } from "./stored-collection.ts";
import type { SyncCounters } from "./sync-counters.ts";
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
  /** Counts each change applied and how it arrived (`agent-host.sync-diagnostics`); none by default. */
  counters?: Pick<SyncCounters, "applied">;
}

/** A write the source accepted, kept until a sync that started after it has landed. */
interface AcceptedWrite<Item> {
  seq: number;
  id: MessagingId;
  change: (item: Item) => Item;
}

/**
 * One collection of the local copy: its items in memory, its watermark and the mapping version
 * they were made with, saved after every change. The saved copy is read once, on first use, so
 * a restart serves what was kept before the source answers. Once closed, as Disconnect does, it
 * keeps and saves nothing more, also for a read or a write that was in flight.
 */
export class KeptCollection<Item extends { id: MessagingId }> {
  readonly #collection: SyncCollection<Item>;
  readonly #options: KeptCollectionOptions;
  /** In the order the collection gave them; `undefined` until one read or a saved copy. */
  #items: Item[] | undefined;
  #asOf: string | undefined;
  #mapping: string | undefined;
  #opened: Promise<void> | undefined;
  #closed = false;
  /** The save in flight; saves run one after another, so `close` can wait for the last. */
  #saving: Promise<void> = Promise.resolve();
  /** Writes accepted since the oldest sync in flight started, which a later sync applies again. */
  #writes: AcceptedWrite<Item>[] = [];
  #seq = 0;
  /** Whether the item cap cut a `changed` batch, so the next read asks for `all` again. */
  #cut = false;

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
    const startedAt = this.#seq;
    const change = this.#change();
    const batch = await this.#collection.read(change);
    if (this.#closed) return false;
    const items = this.#withWritesAfter(startedAt, this.#applied(batch));
    const changed =
      this.#items === undefined || JSON.stringify(items) !== JSON.stringify(this.#items);
    const moved =
      changed || batch.asOf !== this.#asOf || this.#mapping !== this.#collection.mapping;
    this.#items = items;
    this.#asOf = batch.asOf;
    this.#mapping = this.#collection.mapping;
    if (moved) await this.#save();
    // A whole read is the first load or a catch-up; a read of what changed is a poll.
    if (changed)
      this.#options.counters?.applied(change.kind === "all" ? "catch-up" : "poll", batch.asOf);
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
    if (this.#closed || items === undefined || !items.some((item) => item.id === id)) {
      return false;
    }
    this.#seq += 1;
    this.#writes.push({ seq: this.#seq, id, change });
    this.#items = items.map((item) => (item.id === id ? change(item) : item));
    await this.#save();
    this.#options.counters?.applied("write");
    return true;
  }

  /**
   * Forgets what is kept in memory and keeps nothing more: a read or a write still in flight
   * saves nothing. Resolves once the last save already started has finished, so the store can
   * then delete the source's saved records knowing nothing writes them again.
   */
  close(): Promise<void> {
    this.#closed = true;
    this.#items = undefined;
    this.#asOf = undefined;
    this.#mapping = undefined;
    this.#writes = [];
    this.#opened = Promise.resolve();
    // A failed save already failed the call that made it; here only its end matters.
    return this.#saving.catch(() => undefined);
  }

  #change(): SyncChange {
    const asOf = this.#asOf;
    if (asOf === undefined || this.#cut || this.#mapping !== this.#collection.mapping) {
      return { kind: "all" };
    }
    return { kind: "since", asOf };
  }

  #applied(batch: SyncBatch<Item>): Item[] {
    const itemsMax = this.#options.itemsMax ?? keptItemsMax;
    const all = batch.kind === "all" ? [...batch.items] : this.#merged(batch);
    // A `changed` batch never brings back what the cap dropped, so the next read is `all`.
    this.#cut = batch.kind === "changed" && all.length > itemsMax;
    return all.slice(0, itemsMax);
  }

  #merged(batch: SyncBatch<Item>): Item[] {
    const replaced = new Map(batch.items.map((item) => [item.id, item]));
    const left = new Set([...batch.removed, ...replaced.keys()]);
    const kept = (this.#items ?? []).filter((item) => !left.has(item.id));
    return [...replaced.values(), ...kept];
  }

  /**
   * `items` with the writes accepted after the sync that read them started applied again: the
   * read may predate the write, and must not undo it, such as a card answered meanwhile.
   */
  #withWritesAfter(startedAt: number, items: Item[]): Item[] {
    const later = this.#writes.filter((write) => write.seq > startedAt);
    this.#writes = later;
    return later.reduce(
      (current, write) => current.map((item) => (item.id === write.id ? write.change(item) : item)),
      items,
    );
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
    if (saved === undefined || this.#closed) return;
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

  #save(): Promise<void> {
    const { persistence, source } = this.#options;
    const [items, asOf, mapping] = [this.#items, this.#asOf, this.#mapping];
    if (this.#closed || items === undefined || asOf === undefined || mapping === undefined) {
      return Promise.resolve();
    }
    const stored = {
      store: storeFormat,
      port: agentMessagingVersion,
      mapping,
      source,
      asOf,
      items,
    };
    // One save at a time, in order; the save before failed its own caller already.
    const save = this.#saving
      .catch(() => undefined)
      .then(() => (this.#closed ? undefined : persistence.save(this.#collection.name, stored)));
    this.#saving = save;
    return save;
  }
}
