// What the collection page shows of a collection and its records, and what a
// person's edit of a cell or of the new row means (requirement
// `engine.collection-grid`). Nothing is stored here: the caller reads the
// records and writes the change this returns.

import type { Collection } from "@halonicjs/format";
import { type CollectionRecord, viewRecords } from "./record-query.ts";
import { checkRecord, type RecordValues } from "./record-values.ts";

/** One column of the grid, in the order of the collection file. */
export interface GridField {
  readonly name: string;
  readonly type: Collection["fields"][string]["type"];
  readonly required: boolean;
  /** A computed column: its cells open no editor. */
  readonly computed: boolean;
  /** The allowed values of a choice field; empty for the other types. */
  readonly choices: readonly string[];
}

/** A chip: `view` is `null` for "All". `total` is there when the view names a field to sum. */
export interface GridView {
  readonly view: string | null;
  readonly count: number;
  readonly total?: number;
}

/** The grid for one chosen view. */
export interface CollectionGrid {
  readonly fields: readonly GridField[];
  readonly views: readonly GridView[];
  /** The chosen view's records, or every record for "All". */
  readonly rows: readonly CollectionRecord[];
}

/**
 * The columns, the chips with their counts and totals, and the rows of the
 * chosen view. A view the collection doesn't have shows every record.
 *
 * @param today - today's date as YYYY-MM-DD, for views that filter on `"today"`
 *
 * @example
 * collectionGrid(claims, records, "2026-11-15", "open").views;
 * // [{ view: null, count: 2 }, { view: "open", count: 1, total: 45 }]
 */
export function collectionGrid(
  collection: Collection,
  records: readonly CollectionRecord[],
  today: string,
  view: string | null = null,
): CollectionGrid {
  const fields = Object.entries(collection.fields).map(([name, field]) => ({
    name,
    type: field.type,
    required: field.required,
    computed: field.compute !== undefined,
    choices: field.values ?? [],
  }));
  const views: GridView[] = [{ view: null, count: records.length }];
  for (const name of Object.keys(collection.views)) {
    const viewed = viewRecords(collection, records, name, today);
    views.push({
      view: name,
      count: viewed.records.length,
      ...(viewed.total === undefined ? {} : { total: viewed.total }),
    });
  }
  const rows = view === null ? [...records] : viewRecords(collection, records, view, today).records;
  return { fields, views, rows };
}

/** What a cell edit means: the change to write, or the core message to show under the cell. */
export type CellEdit =
  | { readonly ok: true; readonly values: RecordValues }
  | { readonly ok: false; readonly message: string };

/**
 * The change for text typed into one cell of an existing record. Empty text
 * empties the field; anything else is checked like an agent's value.
 *
 * @example
 * editCell(claims, "amount", "65"); // { ok: true, values: { amount: 65 } }
 * editCell(claims, "amount", "lots"); // { ok: false, message: '"amount" must be a number (got "lots")' }
 */
export function editCell(collection: Collection, field: string, text: string): CellEdit {
  const definition = Object.hasOwn(collection.fields, field) ? collection.fields[field] : undefined;
  if (definition === undefined || definition.compute !== undefined) {
    return { ok: false, message: `"${field}" cannot be edited.` };
  }
  const checked = checkRecord(collection, { [field]: text.trim() }, { partial: true });
  const [message] = checked.errors;
  return message === undefined ? { ok: true, values: checked.values } : { ok: false, message };
}

/** The new row's state: what to show in it and what is still needed before it becomes a record. */
export interface NewRow {
  /** The typed text with the defaults of fields left empty; computed fields have none. */
  readonly draft: Readonly<Record<string, string>>;
  /** The names of required fields still empty after the defaults, in file order. */
  readonly stillNeeded: readonly string[];
  /** The record to add when nothing is still needed and every value is accepted. */
  readonly record?: RecordValues;
  /** The first value the field doesn't accept, when nothing is still needed. */
  readonly message?: string;
}

/**
 * Works out the new row from what has been typed, by field name. A required
 * field with a default counts as filled. The record comes only when every
 * required field is filled and every value is accepted.
 *
 * @example
 * newRow(claims, { what: "School trip", amount: "20" }).record;
 * // { what: "School trip", amount: 20, sharePct: 100 }
 */
export function newRow(collection: Collection, typed: Readonly<Record<string, string>>): NewRow {
  const draft: Record<string, string> = {};
  const stillNeeded: string[] = [];
  const input: RecordValues = {};
  for (const [name, field] of Object.entries(collection.fields)) {
    if (field.compute !== undefined) {
      continue;
    }
    const text = (typed[name] ?? "").trim();
    if (text !== "") {
      draft[name] = text;
      input[name] = text;
    } else if (field.default !== undefined && field.default !== null) {
      draft[name] = String(field.default);
    } else if (field.required) {
      stillNeeded.push(name);
    }
  }
  if (stillNeeded.length > 0) {
    return { draft, stillNeeded };
  }
  const checked = checkRecord(collection, input);
  const [message] = checked.errors;
  return message === undefined
    ? { draft, stillNeeded, record: checked.values }
    : { draft, stillNeeded, message };
}
