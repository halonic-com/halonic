import type { z } from "zod";
import { formatPath, type Path, toPathSegment } from "./issue.ts";

/**
 * The longest value a message repeats back, such as `write [input.mail]`. A
 * longer one, or one over several lines, gets a general example instead.
 */
const longestEcho = 40;

/**
 * Says one of Zod's issues in plain words, with the field's name and how to
 * fix it, for the issues a new user meets most (HAL-14277): a number or
 * `true` written in quotes, a list written as one value or as a map, an empty
 * list or text, an empty value, a number out of range and an address
 * without `https://`.
 * Returns `undefined` for the rest, so Zod's own message stays.
 *
 * Only called for issues whose schema has no message of its own: Zod asks a
 * schema's own message first.
 *
 * @example
 * // { params: { temperature: "0.2" } } for an agent:
 * plainMessage(issue); // "temperature is a number: write 0.2 without quotes."
 */
export function plainMessage(issue: z.core.$ZodRawIssue): string | undefined {
  const field = fieldName((issue.path ?? []).map(toPathSegment));
  if (field === undefined) {
    return undefined;
  }
  switch (issue.code) {
    case "invalid_type":
      return wrongType(field, issue.expected, issue.input);
    case "too_small":
      return tooSmall(field, issue.origin, Number(issue.minimum), issue.inclusive !== false);
    case "too_big":
      return tooBig(field, issue.origin, Number(issue.maximum), issue.inclusive !== false);
    case "invalid_format":
      return issue.format === "url" ? notAnAddress(field, issue.input) : undefined;
  }
  return undefined;
}

/**
 * How a message names the field: from the last key of the path on, so
 * `states.draft.on[0].to` is `to` and `options[0]` stays `options[0]`.
 * `undefined` for the whole file, which has no name to give.
 */
function fieldName(path: Path): string | undefined {
  const lastKey = path.findLastIndex((segment) => typeof segment === "string");
  return lastKey === -1 ? undefined : formatPath(path.slice(lastKey));
}

/** A value of the wrong type: a number, `true`, a list, text or a map was expected. */
function wrongType(field: string, expected: string, input: unknown): string | undefined {
  if (input === undefined) {
    // A key that isn't there: the format layer says "Missing required key".
    return undefined;
  }
  switch (expected) {
    case "number":
      return notANumber(field, input);
    case "int":
      // Zod checks for a number first, so only a number with a fraction gets here.
      return `${field} needs a whole number, such as ${Math.round(Number(input))}.`;
    case "boolean":
      return notTrueOrFalse(field, input);
    case "array":
      return notAList(field, input);
    case "string":
      return notText(field, input);
    case "object":
      return `${field} is a map: write its fields on the lines below it, indented.`;
  }
  return undefined;
}

/**
 * YAML reads a key with nothing after it, such as `temperature:`, as `null`:
 * the person left it empty, so the message says so rather than "not nothing"
 * (C571).
 */
function notANumber(field: string, input: unknown): string {
  if (input === null) {
    return `${field} is empty: write a number.`;
  }
  if (typeof input === "string" && input.trim() !== "" && Number.isFinite(Number(input))) {
    const value = echo(input);
    return value === undefined
      ? `${field} is a number: write it without quotes.`
      : `${field} is a number: write ${value} without quotes.`;
  }
  return `${field} needs a number, not ${kindOf(input)}.`;
}

function notTrueOrFalse(field: string, input: unknown): string {
  if (input === null) {
    return `${field} is empty: write true or false.`;
  }
  const text = typeof input === "string" ? input.trim().toLowerCase() : undefined;
  if (text === "true" || text === "false") {
    return `${field} is true or false: write ${text} without quotes.`;
  }
  return `${field} needs true or false, not ${kindOf(input)}.`;
}

/** A list written as one value gets that value in brackets; a map, the dash its items need. */
function notAList(field: string, input: unknown): string {
  if (isMap(input)) {
    const [firstKey] = Object.keys(input);
    const dash = firstKey === undefined ? "- " : `- ${firstKey}:`;
    return `${field} is a list: start each item with "${dash}".`;
  }
  const value = echo(input);
  return value === undefined
    ? `${field} is a list: write [one, two], or each item on its own line after "- ".`
    : `${field} is a list: write [${value}].`;
}

function notText(field: string, input: unknown): string {
  if (input === null) {
    return `${field} is empty: write a value.`;
  }
  if (typeof input === "number" || typeof input === "boolean") {
    return `${field} is text: write "${input}" in quotes.`;
  }
  return `${field} needs text, not ${kindOf(input)}.`;
}

/** Too few items, too short a text or too small a number. */
function tooSmall(
  field: string,
  origin: string,
  minimum: number,
  inclusive: boolean,
): string | undefined {
  switch (origin) {
    case "array":
      return minimum === 1
        ? `${field} needs at least one item.`
        : `${field} needs at least ${minimum} items.`;
    case "string":
      return minimum === 1
        ? `${field} is empty: write a value.`
        : `${field} needs at least ${minimum} characters.`;
    case "number":
      return inclusive
        ? `${field} is too small: use ${minimum} or more.`
        : `${field} must be more than ${minimum}.`;
  }
  return undefined;
}

/** Too many items, too long a text or too big a number. */
function tooBig(
  field: string,
  origin: string,
  maximum: number,
  inclusive: boolean,
): string | undefined {
  switch (origin) {
    case "array":
      return `${field} has too many items: use at most ${maximum}.`;
    case "string":
      return `${field} is too long: use at most ${maximum} characters.`;
    case "number":
      return inclusive
        ? `${field} is too big: use ${maximum} or less.`
        : `${field} must be less than ${maximum}.`;
  }
  return undefined;
}

/**
 * An address that isn't a full URL; one without a scheme gets it added as the
 * example. An address on this computer gets http://, because a local model
 * server (Ollama, LM Studio) answers only on plain http (C571).
 */
function notAnAddress(field: string, input: unknown): string {
  const value = echo(input);
  if (value !== undefined && !value.includes("://")) {
    const scheme = isOnThisComputer(value) ? "http://" : "https://";
    return `${field} needs ${scheme}, such as ${scheme}${value}.`;
  }
  return `${field} needs a full address that starts with https://.`;
}

/** The host names that always mean this computer. */
const thisComputer = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Whether an address without a scheme, such as `localhost:11434/v1`, names this computer. */
function isOnThisComputer(address: string): boolean {
  // `split` always gives at least one part.
  const [authority] = address.split(/[/?#]/u) as [string];
  const host = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : (authority.split(":") as [string])[0];
  return thisComputer.has(host.toLowerCase());
}

/** A short one-line value as the user wrote it, or `undefined` when it's too long to repeat. */
function echo(input: unknown): string | undefined {
  if (typeof input !== "string" && typeof input !== "number" && typeof input !== "boolean") {
    return undefined;
  }
  const text = String(input).trim();
  return text === "" || text.length > longestEcho || text.includes("\n") ? undefined : text;
}

/**
 * What a value is, in the words of a YAML file. An empty value (`null`) never
 * gets here: its message says it's empty (C571).
 */
function kindOf(input: unknown): string {
  if (Array.isArray(input)) return "a list";
  if (isMap(input)) return "a map";
  if (typeof input === "boolean") return "true or false";
  if (typeof input === "number") return "a number";
  return "text";
}

function isMap(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
