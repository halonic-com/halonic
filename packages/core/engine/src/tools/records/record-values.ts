// Checks the values an agent gives a record against its collection's
// fields. The model writes them, so each value is checked and, where the
// meaning is clear, brought into the field's form: "12,50" becomes 12.5 in a
// money field, "true" becomes true in a boolean one.

import type { Collection, CollectionField } from "@halonicjs/format";

/** A record's values by field name. */
export type RecordValues = Record<string, unknown>;

/** The checked values, and what was wrong; the values count only when `errors` is empty. */
export interface CheckedValues {
  readonly values: RecordValues;
  readonly errors: readonly string[];
}

/**
 * Checks values for a new record, or with `partial` for an update, against
 * the collection's fields (requirement `engine.record-values`). An `id` key
 * is left to the caller. A new record gets each field's default when the
 * value is left out; an update changes only the fields it names.
 *
 * @example
 * checkRecord(invoices, { amount: "12,50" }).values; // { amount: 12.5 }
 */
export function checkRecord(
  collection: Collection,
  input: RecordValues,
  options: { readonly partial?: boolean } = {},
): CheckedValues {
  const partial = options.partial ?? false;
  const errors = unknownOrComputedKeys(collection, input);
  const values: RecordValues = {};
  for (const [name, field] of Object.entries(collection.fields)) {
    if (field.compute !== undefined) {
      continue;
    }
    const value = input[name] === undefined && !partial ? field.default : input[name];
    const checked = checkField(name, field, value, partial);
    if (checked.kind === "value") {
      values[name] = checked.value;
    } else if (checked.kind === "error") {
      errors.push(checked.error);
    }
  }
  return { values, errors };
}

type FieldOutcome =
  | { kind: "value"; value: unknown }
  | { kind: "error"; error: string }
  | { kind: "left-out" };

function checkField(
  name: string,
  field: CollectionField,
  value: unknown,
  partial: boolean,
): FieldOutcome {
  if (value === undefined || value === null || value === "") {
    // An update may leave a required field out, but not empty it.
    if (field.required && !(partial && value === undefined)) {
      return { kind: "error", error: `"${name}" is required` };
    }
    return value === undefined ? { kind: "left-out" } : { kind: "value", value: null };
  }
  const checked = checkFieldValue(field, value);
  if (!checked.ok) {
    return {
      kind: "error",
      error: `"${name}" must be ${checked.expected} (got ${JSON.stringify(value)})`,
    };
  }
  return { kind: "value", value: checked.value };
}

function unknownOrComputedKeys(collection: Collection, input: RecordValues): string[] {
  const errors: string[] = [];
  const names = Object.keys(collection.fields).join(", ");
  for (const key of Object.keys(input)) {
    // Own keys only: `constructor` must not find Object.prototype's.
    const field = Object.hasOwn(collection.fields, key) ? collection.fields[key] : undefined;
    if (key === "id") {
      continue;
    }
    if (field === undefined) {
      errors.push(`Unknown field "${key}" (fields: ${names})`);
    } else if (field.compute !== undefined) {
      errors.push(`"${key}" is computed and cannot be set`);
    }
  }
  return errors;
}

type FieldCheck = { ok: true; value: unknown } | { ok: false; expected: string };

function checkFieldValue(field: CollectionField, value: unknown): FieldCheck {
  switch (field.type) {
    case "number":
    case "money":
      return checkNumber(field, value);
    case "date":
      return checkCalendar(value, /^\d{4}-\d{2}-\d{2}$/, "a date YYYY-MM-DD");
    case "month":
      return checkCalendar(value, /^\d{4}-\d{2}$/, "a month YYYY-MM");
    case "choice":
      return checkChoice(field.values ?? [], value);
    case "boolean":
      return checkBoolean(value);
    case "text":
    case "ref":
      return { ok: true, value: typeof value === "string" ? value : JSON.stringify(value) };
  }
}

function checkNumber(field: CollectionField, value: unknown): FieldCheck {
  const number = toNumber(value);
  if (!Number.isFinite(number)) {
    return { ok: false, expected: "a number" };
  }
  if (field.min !== undefined && number < field.min) {
    return { ok: false, expected: `at least ${field.min}` };
  }
  if (field.max !== undefined && number > field.max) {
    return { ok: false, expected: `at most ${field.max}` };
  }
  return { ok: true, value: field.type === "money" ? roundCents(number) : number };
}

// A model often writes an amount as text, with a decimal comma or a currency
// sign. Text with nothing left after the sign, such as "€", is not a number.
// Nor is "1,234": it may mean 1234 or 1.234, so the model is asked again.
function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return Number.NaN;
  }
  const text = value.replace(/[€$\s]/g, "");
  if (text === "" || /,\d{3}$/.test(text)) {
    return Number.NaN;
  }
  return Number(text.replace(",", "."));
}

// A date or month in its pattern that is also on the calendar: "2026-02-30"
// and "2026-13" are refused.
function checkCalendar(value: unknown, pattern: RegExp, expected: string): FieldCheck {
  if (typeof value !== "string" || !pattern.test(value)) {
    return { ok: false, expected };
  }
  const [year = 0, month = 0, day = 1] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const onCalendar = date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return onCalendar ? { ok: true, value } : { ok: false, expected };
}

function checkChoice(choices: readonly string[], value: unknown): FieldCheck {
  const text = String(value);
  return choices.includes(text)
    ? { ok: true, value: text }
    : { ok: false, expected: `one of ${choices.join(", ")}` };
}

function checkBoolean(value: unknown): FieldCheck {
  if (typeof value === "boolean") {
    return { ok: true, value };
  }
  if (value === "true" || value === "false") {
    return { ok: true, value: value === "true" };
  }
  return { ok: false, expected: "true or false" };
}

/** A money amount rounded to cents, as money fields and totals are kept. */
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
