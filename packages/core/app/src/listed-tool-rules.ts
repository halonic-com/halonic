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

/** The longest name, and the most characters of a name a refusal repeats. */
export const maxNameLength = 64;

const namePattern = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Whether a text passes the name rule: 1 to 64 ASCII letters, digits, `_`
 * or `-`. The model sends these strings back in calls, so they can't be
 * fenced, and the rule keeps them too short and plain to carry much.
 */
export function passesNameRule(text: unknown): text is string {
  return typeof text === "string" && namePattern.test(text);
}

/** Cuts a text a server wrote to its first 64 characters, for a refusal shown as plain text. */
export function cutName(text: string): string {
  return Array.from(text).slice(0, maxNameLength).join("");
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
  /** The text as the server wrote it. */
  readonly text: string;

  /** @param text - the text as the server wrote it */
  constructor(text: string) {
    this.text = text;
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

/** Walks every object and array, at any key, looking for too deep nesting or a too long text. */
function schemaTextProblem(value: unknown, depth: number): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  if (depth > maxParametersDepth) {
    return `its parameters nest more than ${maxParametersDepth} levels deep`;
  }
  if (isJsonObject(value)) {
    for (const keyword of ["description", "title"]) {
      const text = Object.hasOwn(value, keyword) ? value[keyword] : undefined;
      if (typeof text === "string" && text.length > maxTextLength) {
        return `a "${keyword}" in its parameters is longer than ${maxTextLength} characters`;
      }
    }
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
