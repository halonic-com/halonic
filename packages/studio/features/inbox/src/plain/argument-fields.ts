import { escapeHidden } from "./hidden-characters.ts";

/** What one argument's value shows as. */
export type ArgumentValue =
  /** A string the agent sent: model output, shown as plain text, folded and marked. */
  | { readonly kind: "text"; readonly text: string }
  /** A number or `true`/`false`, as JSON writes it. */
  | { readonly kind: "literal"; readonly text: string }
  /** A word in place of a value, shown muted: "(empty)" for `""`, `{}` and `[]`, "(none)" for `null`. */
  | { readonly kind: "placeholder"; readonly text: "(empty)" | "(none)" }
  /** An object or a list whose fields follow, one level deeper; `text` says how many. */
  | { readonly kind: "group"; readonly text: string }
  /** What the card leaves out of a very large or deep value; the raw JSON has all of it. */
  | { readonly kind: "cut"; readonly text: string };

/** One readable `name: value` line of a tool call's arguments (INBOX-CARD-05). */
export interface ArgumentField {
  /** The argument's name as the agent sent it, or the position (from 1) of a list item. Untrusted. */
  readonly name: string;
  /** 0 for a top-level argument; the card indents each level. */
  readonly depth: number;
  readonly value: ArgumentValue;
}

export interface ArgumentLimits {
  /** Levels shown; a deeper object or list shows only its size. */
  readonly depth: number;
  /** Fields shown in all; the rest is left to the raw JSON. */
  readonly fields: number;
}

/** Five levels and 200 fields keep the card responsive (INBOX-CARD-05). */
export const defaultArgumentLimits: ArgumentLimits = { depth: 5, fields: 200 };

/**
 * Turns a tool call's arguments into readable fields, in the order the
 * agent sent them. Values are never dropped because the tool is unknown;
 * only a value too deep or too large is shortened, saying what's left out.
 * Arguments that aren't an object show as one field, `arguments`.
 *
 * @example
 * argumentFields({ title: "Refund for Sam", tags: [] });
 * // [{ name: "title", depth: 0, value: { kind: "text", text: "Refund for Sam" } },
 * //  { name: "tags", depth: 0, value: { kind: "placeholder", text: "(empty)" } }]
 */
export function argumentFields(
  args: unknown,
  limits: ArgumentLimits = defaultArgumentLimits,
): ArgumentField[] {
  const fields: ArgumentField[] = [];
  const budget = { left: limits.fields };
  if (isObject(args)) addEntries(fields, Object.entries(args), 0, limits, budget);
  else addEntries(fields, [["arguments", args]], 0, limits, budget);
  return fields;
}

/**
 * The exact arguments, for **Show raw JSON** (INBOX-CARD-05). A hidden
 * character shows as its `\uXXXX` escape, like JSON writes a control
 * character, so it can't act on the text around it here either.
 */
export function rawJson(args: unknown): string {
  return escapeHidden(JSON.stringify(args, null, 2) ?? "null");
}

function addEntries(
  fields: ArgumentField[],
  entries: readonly (readonly [string, unknown])[],
  depth: number,
  limits: ArgumentLimits,
  budget: { left: number },
): void {
  for (const [index, [name, value]] of entries.entries()) {
    if (budget.left <= 0) {
      const left = entries.length - index;
      fields.push({
        name: "",
        depth,
        value: {
          kind: "cut",
          text: `${left} more ${left === 1 ? "field" : "fields"} in the raw JSON`,
        },
      });
      return;
    }
    budget.left -= 1;
    addField(fields, name, value, depth, limits, budget);
  }
}

function addField(
  fields: ArgumentField[],
  name: string,
  value: unknown,
  depth: number,
  limits: ArgumentLimits,
  budget: { left: number },
): void {
  if (value === null || value === undefined) {
    fields.push({ name, depth, value: { kind: "placeholder", text: "(none)" } });
    return;
  }
  if (typeof value === "string") {
    const shown: ArgumentValue =
      value === "" ? { kind: "placeholder", text: "(empty)" } : { kind: "text", text: value };
    fields.push({ name, depth, value: shown });
    return;
  }
  if (typeof value !== "object") {
    fields.push({ name, depth, value: { kind: "literal", text: String(value) } });
    return;
  }
  const entries: (readonly [string, unknown])[] = Array.isArray(value)
    ? value.map((item, index) => [String(index + 1), item] as const)
    : Object.entries(value);
  if (entries.length === 0) {
    fields.push({ name, depth, value: { kind: "placeholder", text: "(empty)" } });
    return;
  }
  const size = Array.isArray(value)
    ? `${entries.length} ${entries.length === 1 ? "item" : "items"}`
    : `${entries.length} ${entries.length === 1 ? "field" : "fields"}`;
  if (depth + 1 >= limits.depth) {
    fields.push({ name, depth, value: { kind: "cut", text: `${size} in the raw JSON` } });
    return;
  }
  fields.push({ name, depth, value: { kind: "group", text: size } });
  addEntries(fields, entries, depth + 1, limits, budget);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
