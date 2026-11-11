import type { Guard } from "@halonicjs/format";
import { getPath, render } from "./template.ts";
import { toNumber } from "./to-number.ts";

/** The guards that compare two values as numbers. */
type NumberGuard = Extract<
  Guard,
  { gt: unknown } | { gte: unknown } | { lt: unknown } | { lte: unknown }
>;

/**
 * Decides whether a guard passes against a scope, such as
 * `{ input, context, event }`. Both sides of a comparison may be `{{path}}`
 * templates; they are rendered first.
 *
 * - `equals` and `notEquals` compare the two values. Texts are compared
 *   without the spaces around them; anything else by its JSON. A missing
 *   value equals nothing, so `equals` fails and `notEquals` passes when a side
 *   is missing, even when both are.
 * - `contains` looks for a text inside a text, ignoring case, or for a value
 *   in a list. Anything else contains nothing.
 * - `exists` passes when the path holds a value other than `undefined`,
 *   `null` or `""`. The path may be written as a placeholder too.
 * - `gt`, `gte`, `lt` and `lte` read both sides with {@link toNumber}. A side
 *   that is no number makes the guard fail, whichever way it compares.
 * - `not`, `all` and `any` combine other guards.
 *
 * @example
 * const scope = { context: { amount: "EUR 1.250,00", tags: ["urgent"] } };
 * evaluateGuard({ gte: ["{{context.amount}}", 1000] }, scope); // true
 * evaluateGuard({ contains: ["{{context.tags}}", "urgent"] }, scope); // true
 * evaluateGuard({ not: { exists: "context.owner" } }, scope); // true
 */
export function evaluateGuard(guard: Guard, scope: unknown): boolean {
  if ("equals" in guard) {
    return sameValue(render(guard.equals[0], scope), render(guard.equals[1], scope));
  }
  if ("notEquals" in guard) {
    return !sameValue(render(guard.notEquals[0], scope), render(guard.notEquals[1], scope));
  }
  if ("contains" in guard) {
    return contains(render(guard.contains[0], scope), render(guard.contains[1], scope));
  }
  if ("exists" in guard) {
    return hasValue(getPath(scope, withoutBraces(guard.exists)));
  }
  if ("not" in guard) {
    return !evaluateGuard(guard.not, scope);
  }
  if ("all" in guard) {
    return guard.all.every((inner) => evaluateGuard(inner, scope));
  }
  if ("any" in guard) {
    return guard.any.some((inner) => evaluateGuard(inner, scope));
  }
  return compareNumbers(guard, scope);
}

function compareNumbers(guard: NumberGuard, scope: unknown): boolean {
  const [operator, [left, right]] = numberOperands(guard);
  const a = toNumber(render(left, scope));
  const b = toNumber(render(right, scope));
  if (a === null || b === null) {
    return false;
  }
  switch (operator) {
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
  }
}

function numberOperands(guard: NumberGuard): ["gt" | "gte" | "lt" | "lte", [unknown, unknown]] {
  if ("gt" in guard) return ["gt", guard.gt];
  if ("gte" in guard) return ["gte", guard.gte];
  if ("lt" in guard) return ["lt", guard.lt];
  return ["lte", guard.lte];
}

/**
 * Two texts are the same without the spaces around them; other values when
 * their JSON is. A missing value is the same as nothing, not even as another
 * missing value.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) {
    return false;
  }
  if (typeof a === "string" && typeof b === "string") {
    return a.trim() === b.trim();
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A text inside a text, ignoring case, or a value in a list. */
function contains(haystack: unknown, needle: unknown): boolean {
  if (typeof haystack === "string") {
    return typeof needle === "string" && haystack.toLowerCase().includes(needle.toLowerCase());
  }
  if (Array.isArray(haystack)) {
    return haystack.some((item) => sameValue(item, needle));
  }
  return false;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** `"{{ input.x }}"` as the path `"input.x"`; a plain path stays as it is. */
function withoutBraces(path: string): string {
  return path.replace(/^\{\{\s*|\s*\}\}$/g, "");
}
