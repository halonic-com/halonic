import { whoUses } from "@halonicjs/app";
import {
  type CollectionRecord,
  CollectionRecords,
  collectionGrid,
  editCell,
  newRow,
} from "@halonicjs/engine";
import type { Collection } from "@halonicjs/format";
import type { Clock, RecordChange, RecordStore } from "@halonicjs/ports";
import type {
  CollectionHost,
  CollectionRef,
  CollectionSource,
} from "@halonicjs/studio-feature-library/api";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { unsavedSource, type WorkspaceLibraryItemsParts } from "./workspace-library-items.ts";

/** What {@link WorkspaceCollections} needs of the workspace's files and its records. */
export interface WorkspaceCollectionsParts extends WorkspaceLibraryItemsParts {
  /** The workspace's record store: the same log the CLI and the engine read. */
  readonly records: RecordStore;
  readonly clock: Clock;
  /** Whether the records are kept only while this Studio is open (the demo). */
  readonly volatile?: boolean;
}

/** The person every edit of the page is logged as. */
const you = { person: "you" };

/**
 * The collections of the open workspace for the collection page
 * (`studio.workspace-collections`): the definitions come from the workspace's files with their
 * unsaved changes, the records from its record store through the engine's `CollectionRecords`, so
 * an edit is checked like an agent's and logged as the person "you". The columns, chips and
 * edits are the engine's `collectionGrid`, `editCell` and `newRow`.
 *
 * @example
 * services.provide(CollectionHostService, new WorkspaceCollections({ files, onChange, records, clock }));
 */
export class WorkspaceCollections implements CollectionHost {
  readonly #parts: WorkspaceCollectionsParts;
  readonly #listeners = new Set<() => void>();

  constructor(parts: WorkspaceCollectionsParts) {
    this.#parts = parts;
  }

  async read(ref: CollectionRef): Promise<CollectionSource | undefined> {
    const collection = await this.#find(ref);
    if (collection === undefined) return undefined;
    const records = await this.#recordsOf(collection).all();
    const today = this.#today();
    return {
      name: collection.name ?? collection.id,
      volatile: this.#parts.volatile ?? false,
      grid: (view) => collectionGrid(collection, records, today, view),
      editCell: (field, text) => editCell(collection, field, text),
      newRow: (typed) => newRow(collection, typed),
    };
  }

  async change(
    ref: CollectionRef,
    record: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<"saved" | "removed"> {
    const collection = await this.#require(ref);
    const records = this.#recordsOf(collection);
    if (!(await records.all()).some((current: CollectionRecord) => current.id === record)) {
      return "removed";
    }
    await records.update(record, { ...values });
    this.#notify();
    return "saved";
  }

  async add(ref: CollectionRef, values: Readonly<Record<string, unknown>>): Promise<void> {
    const collection = await this.#require(ref);
    await this.#recordsOf(collection).add({ ...values });
    this.#notify();
  }

  async remove(ref: CollectionRef, record: string): Promise<void> {
    const collection = await this.#require(ref);
    // Reading first adds the seed records once, so a removed seed record doesn't come back.
    await this.#recordsOf(collection).all();
    const change: RecordChange = {
      at: this.#parts.clock.now().toISOString(),
      collection: collection.id,
      id: record,
      op: "remove",
      values: null,
      by: you,
    };
    await this.#parts.records.append([change]);
    this.#notify();
  }

  async usage(ref: CollectionRef) {
    const workspace = await loadWorkspace(unsavedSource(this.#parts.files));
    return whoUses(workspace, { kind: "collection", id: ref.id, hub: ref.hub });
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    const stopFiles = this.#parts.onChange(listener);
    return () => {
      this.#listeners.delete(listener);
      stopFiles();
    };
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  #today(): string {
    return this.#parts.clock.now().toISOString().slice(0, 10);
  }

  #recordsOf(collection: Collection): CollectionRecords {
    return new CollectionRecords(this.#parts.records, collection, this.#parts.clock, you);
  }

  async #find({ hub, id }: CollectionRef): Promise<Collection | undefined> {
    const workspace = await loadWorkspace(unsavedSource(this.#parts.files));
    return filesOf(workspace, "collection").find((item) => item.hub === hub && item.value.id === id)
      ?.value;
  }

  async #require(ref: CollectionRef): Promise<Collection> {
    const collection = await this.#find(ref);
    if (collection === undefined) throw new Error(`The collection "${ref.id}" is gone.`);
    return collection;
  }
}
