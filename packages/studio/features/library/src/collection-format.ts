import type { CollectionChip, CollectionColumn, CollectionRow } from "./collection-host.ts";
import { collectionWords } from "./collection-words.ts";

/** Money and totals use today's `nl-NL` format until the format setting (U74) comes. */
const money = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Plain numbers use `nl-NL` too, so one grid never mixes `1,5` and `1.5`. */
const number = new Intl.NumberFormat("nl-NL");

/** What a cell shows of a value: money with cents, numbers in `nl-NL`, a boolean as yes or no, empty as nothing. */
export function cellText(column: CollectionColumn, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (column.type === "money" && typeof value === "number") return money.format(value);
  if (typeof value === "number") return number.format(value);
  if (typeof value === "boolean") return value ? collectionWords.yes : collectionWords.no;
  return String(value);
}

/**
 * What a record is called in its menu, the Remove dialog and what a screen reader hears: its first
 * field's text, as the grid shows it. `undefined` when that is empty; never the generated id.
 */
export function recordName(
  fields: readonly CollectionColumn[],
  row: CollectionRow | undefined,
): string | undefined {
  const first = fields[0];
  if (first === undefined || row === undefined) return undefined;
  const text = cellText(first, row.values[first.name]).trim();
  return text === "" ? undefined : text;
}

/** A chip's words: "All (1)" or "open (1) · 45,00". */
export function chipText(chip: CollectionChip): string {
  const name = chip.view ?? collectionWords.allChip;
  const total = chip.total === undefined ? "" : ` · ${money.format(chip.total)}`;
  return `${name} (${chip.count})${total}`;
}

/** A column's marks: `*` when required and `ƒ` when computed, each with the word a screen reader says. */
export function headerMarks(
  column: CollectionColumn,
): readonly { readonly mark: string; readonly hint: string }[] {
  return [
    ...(column.required
      ? [{ mark: collectionWords.requiredMark, hint: collectionWords.requiredHint }]
      : []),
    ...(column.computed
      ? [{ mark: collectionWords.computedMark, hint: collectionWords.computedHint }]
      : []),
  ];
}
