import type { CollectionChip, CollectionColumn } from "./collection-host.ts";
import { collectionWords } from "./collection-words.ts";

/** Money and totals use today's `nl-NL` format until the format setting (U74) comes. */
const money = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** What a cell shows of a value: money with cents, a boolean as yes or no, empty as nothing. */
export function cellText(column: CollectionColumn, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (column.type === "money" && typeof value === "number") return money.format(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/** A chip's words: "All (1)" or "open (1) · 45,00". */
export function chipText(chip: CollectionChip): string {
  const name = chip.view ?? collectionWords.allChip;
  const total = chip.total === undefined ? "" : ` · ${money.format(chip.total)}`;
  return `${name} (${chip.count})${total}`;
}

/** A column's header: its name with `*` when required and `ƒ` when computed. */
export function headerText(column: CollectionColumn): string {
  const marks = [
    column.required ? collectionWords.requiredMark : "",
    column.computed ? collectionWords.computedMark : "",
  ].join("");
  return marks === "" ? column.name : `${column.name} ${marks}`;
}
