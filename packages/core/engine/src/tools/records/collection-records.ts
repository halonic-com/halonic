// Reading and writing one collection's records for an agent: every value
// checked against the fields, the seed records added once, and every change
// logged with the run and agent that made it.

import type { Collection } from "@halonicjs/format";
import type { Clock, RecordChange, RecordStore } from "@halonicjs/ports";
import { optionalStringArg } from "../tool-args.ts";
import {
  type CollectionRecord,
  currentRecords,
  filterRecords,
  viewRecords,
} from "./record-query.ts";
import { checkRecord, type RecordValues } from "./record-values.ts";

/** What `find` takes: a `where`, a view's name and the most records to give. */
export interface RecordQuery {
  readonly where?: Readonly<Record<string, unknown>>;
  readonly view?: string;
  readonly limit?: number;
}

/** What `find` gives: the records, and the view's total when it has one. */
export interface FoundRecords {
  readonly records: CollectionRecord[];
  readonly total?: number;
}

/** The most records `find` gives when the query sets no limit. */
export const defaultFindLimit = 200;

/** One collection's records in a record store, as an agent reads and writes them. */
export class CollectionRecords {
  readonly #store: RecordStore;
  readonly #collection: Collection;
  readonly #clock: Clock;
  readonly #by: NonNullable<RecordChange["by"]>;

  /**
   * @param by - the run and agent every change is logged with
   */
  constructor(
    store: RecordStore,
    collection: Collection,
    clock: Clock,
    by: NonNullable<RecordChange["by"]>,
  ) {
    this.#store = store;
    this.#collection = collection;
    this.#clock = clock;
    this.#by = by;
  }

  /**
   * The records that match the query, at most `limit` of them (requirement
   * `engine.record-tools`).
   *
   * @throws Error when the query names a view the collection doesn't have
   */
  async find(query: RecordQuery = {}): Promise<FoundRecords> {
    const collection = this.#collection;
    const today = this.#now().slice(0, 10);
    // The model chooses the view, so only an own key counts: not `constructor`.
    if (query.view !== undefined && !Object.hasOwn(collection.views, query.view)) {
      const views = Object.keys(collection.views).join(", ") || "none";
      throw new Error(
        `Collection "${collection.id}" has no view "${query.view}" (views: ${views})`,
      );
    }
    const all = await this.all();
    const viewed =
      query.view === undefined ? { records: all } : viewRecords(collection, all, query.view, today);
    const records = filterRecords(viewed.records, query.where ?? {}, { today }).slice(
      0,
      query.limit ?? defaultFindLimit,
    );
    return viewed.total === undefined ? { records } : { records, total: viewed.total };
  }

  /**
   * Adds a record and gives it as stored. Without an `id` in the values, it
   * gets one made from the collection, the time and the count.
   *
   * @throws Error when the id isn't a string, is blank or has spaces around it,
   *   with every problem with the values, or when the id is taken
   */
  async add(input: RecordValues): Promise<CollectionRecord> {
    const givenId = recordIdArg(input);
    const checked = checkRecord(this.#collection, input);
    if (checked.errors.length > 0) {
      throw new Error(checked.errors.join("; "));
    }
    const existing = await this.all();
    const id = givenId ?? this.#newId(existing.length);
    if (existing.some((record) => record.id === id)) {
      throw new Error(`A record "${id}" already exists in ${this.#collection.id}`);
    }
    await this.#append({ id, op: "add", values: checked.values });
    return this.#stored(id);
  }

  /**
   * Changes the given fields of a record and gives it as stored.
   *
   * @throws Error when there is no such record, or with every problem with the values
   */
  async update(id: string, input: RecordValues): Promise<CollectionRecord> {
    if (!(await this.all()).some((record) => record.id === id)) {
      throw new Error(`No record "${id}" in ${this.#collection.id}`);
    }
    const checked = checkRecord(this.#collection, input, { partial: true });
    if (checked.errors.length > 0) {
      throw new Error(checked.errors.join("; "));
    }
    await this.#append({ id, op: "update", values: checked.values });
    return this.#stored(id);
  }

  /**
   * The current records. Seed records whose id never appeared in the log are
   * added first, once: a record that was removed doesn't come back.
   *
   * This writes those seed records to the store, so even a `find` can write.
   * Two reads at the same time can each write the same seeds; that is fine
   * while a turn runs its tools one at a time.
   */
  async all(): Promise<CollectionRecord[]> {
    const changes = await this.#store.changes(this.#collection.id);
    const seen = new Set(changes.map((change) => change.id));
    const at = this.#now();
    const seeds: RecordChange[] = this.#collection.seed
      .filter((seed) => !seen.has(seed.id))
      .map(({ id, ...values }) => ({
        at,
        collection: this.#collection.id,
        id,
        op: "seed",
        values: checkRecord(this.#collection, values).values,
      }));
    if (seeds.length > 0) {
      await this.#store.append(seeds);
    }
    return currentRecords(this.#collection, [...changes, ...seeds]);
  }

  async #stored(id: string): Promise<CollectionRecord> {
    const record = (await this.all()).find((current) => current.id === id);
    if (record === undefined) {
      // Another writer removed it between the append and this read.
      throw new Error(
        `The record "${id}" in ${this.#collection.id} was removed while it was saved`,
      );
    }
    return record;
  }

  #append(change: Pick<RecordChange, "id" | "op" | "values">): Promise<void> {
    return this.#store.append([
      { ...change, at: this.#now(), collection: this.#collection.id, by: this.#by },
    ]);
  }

  #newId(count: number): string {
    return `${this.#collection.id}-${this.#clock.now().getTime().toString(36)}-${count + 1}`;
  }

  #now(): string {
    return this.#clock.now().toISOString();
  }
}

/**
 * The id the model gave a new record, or `undefined` when it left it out.
 *
 * @throws Error when it isn't a string, is blank or has spaces around it
 */
function recordIdArg(input: RecordValues): string | undefined {
  const id = optionalStringArg(input, "id");
  if (id !== undefined && id.trim() !== id) {
    throw new Error(
      `"id" must not be blank or start or end with a space (got ${JSON.stringify(id)})`,
    );
  }
  return id;
}
