// The simple table a plugin's result may be (`plugins.plugin-text`): a JSON
// list of flat objects, one per row. Anything else shows as plain text.

/** A result read as a table. Every cell is plain text. */
export interface Table {
  /** The keys of the rows, in the order they first appear. */
  readonly columns: readonly string[];
  /** One cell per column; `""` where a row has no value for it. */
  readonly rows: readonly (readonly string[])[];
}

/**
 * Reads a tool's answer as a table, or gives `null` when it isn't one: not
 * JSON, not a list, empty, or with a row that isn't an object. A cell that
 * holds a list or an object shows as its JSON.
 *
 * @param source - the tool's answer
 * @example
 * readTable('[{"day":"Mon","high":21},{"day":"Tue","rain":true}]');
 * // { columns: ["day", "high", "rain"], rows: [["Mon", "21", ""], ["Tue", "", "true"]] }
 */
export function readTable(source: string): Table | null {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0 || !value.every(isRow)) return null;
  const columns = [...new Set(value.flatMap((row) => Object.keys(row)))];
  const rows = value.map((row) =>
    columns.map((column) => (Object.hasOwn(row, column) ? cellText(row[column]) : "")),
  );
  return { columns, rows };
}

function isRow(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cellText(value: unknown): string {
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
