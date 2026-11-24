/** A JSON object from Paperclip, read field by field: nothing in it is trusted to have a shape. */
export type JsonRecord = Readonly<Record<string, unknown>>;

/** `value` as an object, or `undefined` for anything else. */
export function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

/** The objects in `value` when it is a list; anything that isn't an object is left out. */
export function asRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    return record === undefined ? [] : [record];
  });
}

/** Field `name` of `record` when it is a non-empty string. */
export function text(record: JsonRecord | undefined, name: string): string | undefined {
  const value = record?.[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Field `name` of `record`, whatever it holds. */
export function field(record: JsonRecord | undefined, name: string): unknown {
  return record?.[name];
}

/** `value` when it is a list, otherwise an empty one. */
export function asList(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}
