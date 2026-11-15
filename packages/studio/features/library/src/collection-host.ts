import type { ItemUsage } from "@halonicjs/app";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Which collection: its id, and the hub it sits in, or `null` when the workspace shares it. */
export interface CollectionRef {
  readonly hub: string | null;
  readonly id: string;
}

// The shapes below are what the engine's `collectionGrid`, `editCell` and `newRow` return. They are
// written out here because a Studio feature uses no engine code: the app's host calls the engine.

/** What a column holds, and so which editor its cells open. */
export type CollectionColumnType =
  | "text"
  | "number"
  | "money"
  | "date"
  | "month"
  | "choice"
  | "boolean"
  | "ref";

/** One column of the grid, in the order of the collection file. */
export interface CollectionColumn {
  readonly name: string;
  readonly type: CollectionColumnType;
  readonly required: boolean;
  /** A computed column: its cells open no editor. */
  readonly computed: boolean;
  /** The allowed values of a choice column; empty for the other types. */
  readonly choices: readonly string[];
}

/** One current record, computed fields included. */
export interface CollectionRow {
  readonly id: string;
  readonly values: Readonly<Record<string, unknown>>;
}

/** A chip: `view` is `null` for "All". `total` is there when the view names a field to sum. */
export interface CollectionChip {
  readonly view: string | null;
  readonly count: number;
  readonly total?: number;
}

/** The grid for one chosen view. */
export interface CollectionGridData {
  readonly fields: readonly CollectionColumn[];
  readonly views: readonly CollectionChip[];
  readonly rows: readonly CollectionRow[];
}

/** What a cell edit means: the change to write, or the core message to show under the cell. */
export type CollectionCellEdit =
  | { readonly ok: true; readonly values: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly message: string };

/** The new row's state: what it shows and what is still needed before it becomes a record. */
export interface CollectionNewRow {
  /** The typed text with the defaults of fields left empty. */
  readonly draft: Readonly<Record<string, string>>;
  /** The names of required fields still empty after the defaults, in file order. */
  readonly stillNeeded: readonly string[];
  /** The record to add, when nothing is still needed and every value is accepted. */
  readonly record?: Readonly<Record<string, unknown>>;
  /** The first value the field doesn't accept, when nothing is still needed. */
  readonly message?: string;
}

/** A collection as the host reads it: its name, its records and the rules for editing them. */
export interface CollectionSource {
  readonly name: string;
  /** The records are kept only while this Studio is open (the demo). */
  readonly volatile: boolean;
  /** The columns, chips and rows of the chosen view (`null` for All), as of the host's read. */
  grid(view: string | null): CollectionGridData;
  /** What typing `text` into a cell of `field` means. */
  editCell(field: string, text: string): CollectionCellEdit;
  /** The new row with `typed` (text by field name) in it. */
  newRow(typed: Readonly<Record<string, string>>): CollectionNewRow;
}

/** The collections of the open workspace, one at a time. The app provides it for each open workspace. */
export interface CollectionHost {
  /** The collection, or `undefined` when the workspace has none with this id. Rejects when it can't be read. */
  read(collection: CollectionRef): Promise<CollectionSource | undefined>;
  /**
   * Changes the given values of a record as the person "you". Resolves to `removed` when the
   * record is gone, and then writes nothing. Rejects when it can't be written.
   */
  change(
    collection: CollectionRef,
    record: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<"saved" | "removed">;
  /** Adds a record as the person "you". Rejects when it can't be written. */
  add(collection: CollectionRef, values: Readonly<Record<string, unknown>>): Promise<void>;
  /** Removes a record as the person "you". A record that is gone already is fine. Rejects when it can't be written. */
  remove(collection: CollectionRef, record: string): Promise<void>;
  /** Who uses the collection (`whoUses` of core). */
  usage(collection: CollectionRef): Promise<ItemUsage>;
  /** Calls `listener` whenever a collection or its records may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

export const CollectionHostService: ServiceKey<CollectionHost> =
  serviceKey<CollectionHost>("library.collection");
