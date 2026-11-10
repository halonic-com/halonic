// The records of a collection as an agent reads them: the change log folded
// up with computed fields filled in, then filtered by a `where`, or by one
// of the collection's named views.

import type { Collection } from "@halonicjs/format";
import { foldRecords, type RecordChange } from "@halonicjs/ports";
import { evaluateFormula } from "./computed.ts";
import { type RecordValues, roundCents } from "./record-values.ts";

/** One current record: its id, its values with computed fields, and the time of its last change. */
export interface CollectionRecord {
  readonly id: string;
  readonly values: RecordValues;
  readonly updatedAt: string;
}

/** A view's records and, when the view has one, its total. */
export interface ViewedRecords {
  readonly records: CollectionRecord[];
  readonly total?: number;
}

/**
 * The current records of a collection from its changes, oldest first, with
 * each computed field worked out from the stored values (requirement
 * `engine.record-computed`). A computed money field is rounded to cents.
 */
export function currentRecords(
  collection: Collection,
  changes: readonly RecordChange[],
): CollectionRecord[] {
  return [...foldRecords(changes)].map(([id, record]) => ({
    id,
    values: withComputed(collection, record.values),
    updatedAt: record.at,
  }));
}

function withComputed(collection: Collection, stored: RecordValues): RecordValues {
  const values = { ...stored };
  for (const [name, field] of Object.entries(collection.fields)) {
    if (field.compute === undefined) {
      continue;
    }
    const value = evaluateFormula(field.compute, values);
    values[name] = value !== null && field.type === "money" ? roundCents(value) : value;
  }
  return values;
}

/**
 * The records that match every condition of `where` (requirement
 * `engine.record-filter`), sorted by `sort` when given. A condition is a
 * value to equal, a list of values to equal one of, `null` for empty, or
 * an object of `gt`, `gte`, `lt`, `lte` and `not`. The value `"today"`
 * stands for `today` (YYYY-MM-DD). The key `id` matches the record's id.
 */
export function filterRecords(
  records: readonly CollectionRecord[],
  where: Readonly<Record<string, unknown>>,
  options: { readonly today: string; readonly sort?: string },
): CollectionRecord[] {
  const conditions = Object.entries(where);
  const matching = records.filter((record) =>
    conditions.every(([key, condition]) =>
      matches(key === "id" ? record.id : record.values[key], condition, options.today),
    ),
  );
  const sort = options.sort;
  if (sort !== undefined) {
    matching.sort((first, second) => compareForSort(first.values[sort], second.values[sort]));
  }
  return matching;
}

/**
 * A named view's records, with its `where` and `sort`, and the sum of its
 * `total` field rounded to cents when it names one (requirement
 * `engine.record-filter`). The caller checks that the view exists.
 */
export function viewRecords(
  collection: Collection,
  records: readonly CollectionRecord[],
  viewName: string,
  today: string,
): ViewedRecords {
  const view = collection.views[viewName];
  if (view === undefined) {
    return { records: [...records] };
  }
  const viewed = filterRecords(records, view.where, {
    today,
    ...(view.sort === undefined ? {} : { sort: view.sort }),
  });
  const totalField = view.total;
  if (totalField === undefined) {
    return { records: viewed };
  }
  const total = viewed.reduce((sum, record) => {
    const value = record.values[totalField];
    return typeof value === "number" ? sum + value : sum;
  }, 0);
  return { records: viewed, total: roundCents(total) };
}

function matches(value: unknown, condition: unknown, today: string): boolean {
  if (condition === null) {
    return value === null || value === undefined;
  }
  if (Array.isArray(condition)) {
    return condition.some((option) => matches(value, option, today));
  }
  if (typeof condition === "object") {
    return matchesComparison(value, condition as Record<string, unknown>, today);
  }
  return value === resolveToday(condition, today);
}

function matchesComparison(
  value: unknown,
  comparison: Record<string, unknown>,
  today: string,
): boolean {
  if (value === null || value === undefined) {
    // An empty value is only "not" something, and only when that something isn't empty.
    return "not" in comparison && comparison["not"] !== null;
  }
  const order = (bound: unknown) => compareTo(value, resolveToday(bound, today));
  const checks: [string, (difference: number) => boolean][] = [
    ["gt", (difference) => difference > 0],
    ["gte", (difference) => difference >= 0],
    ["lt", (difference) => difference < 0],
    ["lte", (difference) => difference <= 0],
  ];
  for (const [key, holds] of checks) {
    if (key in comparison && !holds(order(comparison[key]))) {
      return false;
    }
  }
  return !("not" in comparison && matches(value, comparison["not"], today));
}

// Empty values first, then numbers as numbers and anything else as text.
function compareForSort(first: unknown, second: unknown): number {
  const firstEmpty = first === null || first === undefined;
  const secondEmpty = second === null || second === undefined;
  if (firstEmpty || secondEmpty) {
    return Number(secondEmpty) - Number(firstEmpty);
  }
  return typeof first === "number" && typeof second === "number"
    ? first - second
    : compareText(String(first), String(second));
}

// Numbers compare as numbers; anything else, dates included, as text.
function compareTo(value: unknown, bound: unknown): number {
  if (typeof value === "number") {
    return value - Number(bound);
  }
  return compareText(String(value), String(bound));
}

// Text compares by character code, not by locale, so the order is the same
// on every machine and dates (YYYY-MM-DD) and months (YYYY-MM) come in
// calendar order.
function compareText(text: string, other: string): number {
  if (text === other) {
    return 0;
  }
  return text < other ? -1 : 1;
}

function resolveToday(value: unknown, today: string): unknown {
  return value === "today" ? today : value;
}
