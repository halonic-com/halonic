import { pageWords } from "./page-words.ts";

const words = pageWords.condition;

/** The conditions that compare two values, and the word between them. */
const comparisons = {
  equals: words.equals,
  notEquals: words.notEquals,
  contains: words.contains,
  gt: words.gt,
  gte: words.gte,
  lt: words.lt,
  lte: words.lte,
} as const;

/**
 * An arrow's condition (the file's `when`) in words, as its row in the step card shows it:
 * `{ equals: ["{{context.category}}", "refund"] }` reads "category = refund". A run's data reads by
 * its name, without the braces and without `context.`; `not`, `all` and `any` read with "not",
 * "and" and "or". A condition the format doesn't have reads as its JSON, so nothing is hidden.
 */
export function conditionWords(condition: unknown): string {
  if (typeof condition !== "object" || condition === null || Array.isArray(condition)) {
    return JSON.stringify(condition);
  }
  const entries = Object.entries(condition);
  const [kind, value] = entries.length === 1 ? (entries[0] as [string, unknown]) : ["", undefined];
  if (Object.hasOwn(comparisons, kind) && Array.isArray(value) && value.length === 2) {
    const word = comparisons[kind as keyof typeof comparisons];
    return `${valueWords(value[0])} ${word} ${valueWords(value[1])}`;
  }
  if (kind === "exists" && typeof value === "string") return words.exists(dataName(value));
  if (kind === "not") return words.not(conditionWords(value));
  if ((kind === "all" || kind === "any") && Array.isArray(value)) {
    return value.map(partWords).join(kind === "all" ? words.and : words.or);
  }
  return JSON.stringify(condition);
}

/** One condition of an `all` or `any`, in brackets when it is a list itself: "a and (b or c)". */
function partWords(part: unknown): string {
  const isList = typeof part === "object" && part !== null && ("all" in part || "any" in part);
  return isList ? `(${conditionWords(part)})` : conditionWords(part);
}

/** One side of a comparison: a run's data by its name, text as written, anything else as JSON. */
function valueWords(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value);
  const path = /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(value)?.[1];
  return path === undefined ? value : dataName(path);
}

/** A path into a run's data by the name steps save it as: `context.category` is "category". */
function dataName(path: string): string {
  return path.startsWith("context.") ? path.slice("context.".length) : path;
}
