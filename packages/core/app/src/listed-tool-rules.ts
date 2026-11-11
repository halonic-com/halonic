// The caps and the name rule of `ports.untrusted-tool-listings`. A server the
// workspace chose wrote every listed tool, so nothing here trusts its shape:
// a field typed as a string may hold anything.

import { utf8Length } from "./routine-ids.ts";

/** The most UTF-8 bytes a listed tool's `parameters` may take as JSON (64 KiB). */
export const maxParametersBytes = 64 * 1024;

/** The longest description, and the longest `description` or `title` in `parameters`. */
export const maxTextLength = 10_000;

/**
 * How many levels of objects and arrays `parameters` may nest, counting
 * the `parameters` object itself as level 1. Real schemas nest a handful of
 * levels; the cap keeps a hostile `[[[[…` from running the walks below out
 * of stack.
 */
export const maxParametersDepth = 64;

/** The most values an `enum` keeps. */
export const maxEnumValues = 64;

/** The longest name, and the most characters of listed text a refusal repeats. */
export const maxNameLength = 64;

/**
 * The most tools one listing may return. 128 is the most tools one OpenAI
 * request accepts, so a longer listing couldn't be offered whole anyway, and
 * the cap bounds the unfenced text one listing carries to 128 × 2,048
 * characters.
 */
export const maxListedTools = 128;

/**
 * The name rule lives in the ports, so a connector file's `tools.read` names
 * pass the same rule as listed names and the two can't drift apart.
 */
export { passesNameRule } from "@halonicjs/ports";

/** Cuts a text a server wrote to its first 64 characters, for a refusal shown as plain text. */
export function cutName(text: string): string {
  return Array.from(text).slice(0, maxNameLength).join("");
}

/**
 * Puts text a server wrote into a refusal's reason: cut to its first 64
 * characters, with quotes, backslashes and every character outside
 * printable ASCII escaped. The reason then stays one plain line, and
 * control or bidi characters can't reorder what the integration status shows.
 *
 * @example
 * escapeListedText('say "hi"\n'); // => say \"hi\"\u{a}
 */
export function escapeListedText(text: string): string {
  return Array.from(cutName(text), escapeCharacter).join("");
}

function escapeCharacter(character: string): string {
  if (character === '"' || character === "\\") {
    return `\\${character}`;
  }
  const codePoint = character.codePointAt(0) ?? 0;
  const isPrintableAscii = codePoint >= 0x20 && codePoint <= 0x7e;
  return isPrintableAscii ? character : `\\u{${codePoint.toString(16)}}`;
}

/**
 * Format characters (zero-width characters, direction marks, the invisible
 * tag letters), variation selectors, and control characters other than line
 * breaks and tabs. A person who reads the tool list can't see them, but the
 * model reads them, so a server could hide instructions in them. Variation
 * selectors aren't format characters, but a run of them after a visible
 * character can carry hidden bytes.
 */
const hiddenText = /(?![\n\r\t])[\p{Cc}\p{Cf}]|[\u{FE00}-\u{FE0F}]|[\u{E0100}-\u{E01EF}]/gu;

/** `text` without the characters a person can't see. */
export function withoutHiddenText(text: string): string {
  return text.replace(hiddenText, "");
}

/**
 * A text a server wrote, such as a listed tool's description. It reaches the
 * model only inside the untrusted fence, which the caller adds.
 *
 * It refuses to turn into JSON, so a tool that still holds one can't be sent
 * to a model by accident before its texts are fenced. That protection is
 * lost when the tool is copied with `structuredClone` or sent over IPC,
 * which turn the text into a plain object: fence the texts before either.
 */
export class UntrustedText {
  /** The text the server wrote, without the characters a person can't see. */
  readonly text: string;

  /** @param text - the text as the server wrote it */
  constructor(text: string) {
    this.text = withoutHiddenText(text);
  }

  /** @throws always: fence the text first */
  toJSON(): never {
    throw new Error(
      "An untrusted text was turned into JSON. Fence it before it reaches the model.",
    );
  }
}

/** Whether a value is a JSON object (not an array and not `null`). */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks the size caps on a listed tool's texts and `parameters`, as the
 * source sent them. The depth comes first, so the JSON size is only
 * measured on parameters that can't overflow the stack.
 *
 * @returns the reason to refuse the tool, or `undefined` when it fits
 */
export function sizeProblem(
  description: string,
  parameters: Record<string, unknown>,
): string | undefined {
  if (description.length > maxTextLength) {
    return `its description is longer than ${maxTextLength} characters`;
  }
  const textProblem = schemaTextProblem(parameters, 1);
  if (textProblem !== undefined) {
    return textProblem;
  }
  return parametersSizeProblem(parameters);
}

function parametersSizeProblem(parameters: Record<string, unknown>): string | undefined {
  let json: string;
  try {
    json = JSON.stringify(parameters);
  } catch {
    // A value JSON can't hold, such as a BigInt, can't come from a real
    // server; the refusal is how this error is reported.
    return "its parameters aren't JSON";
  }
  if (utf8Length(json) > maxParametersBytes) {
    return `its parameters are more than ${maxParametersBytes / 1024} KiB as JSON`;
  }
  return undefined;
}

/** The first of an object's own `description` or `title` that is a too long text. */
function longTextProblem(value: Record<string, unknown>): string | undefined {
  for (const keyword of ["description", "title"]) {
    const text = Object.hasOwn(value, keyword) ? value[keyword] : undefined;
    if (typeof text === "string" && text.length > maxTextLength) {
      return `a "${keyword}" in its parameters is longer than ${maxTextLength} characters`;
    }
  }
  return undefined;
}

/** Walks every object and array, at any key, looking for too deep nesting or a too long text. */
function schemaTextProblem(value: unknown, depth: number): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if (depth > maxParametersDepth) {
    return `its parameters nest more than ${maxParametersDepth} levels deep`;
  }
  const textProblem = isJsonObject(value) ? longTextProblem(value) : undefined;
  if (textProblem !== undefined) {
    return textProblem;
  }
  const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const problem = schemaTextProblem(child, depth + 1);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}
