// Where the suite looks for a leaked key, beyond the plain text: the forms
// a key takes once encoded, and every text an error carries.
import { secretTextForms } from "@halonicjs/std";

/**
 * The forms a canary takes in text: as it is, URL-, form- and JSON-encoded
 * (`secretTextForms`), and in base64 and base64url. A base64 copy inside a
 * longer encoded text depends on where the canary starts, so there is one
 * form per starting position, without the characters the bytes around it
 * change.
 *
 * @example
 * canaryForms("CANARY-k-5f1d").includes("Q0FOQVJZLWstNWYxZ"); // true: base64, without its last, padded character
 */
export function canaryForms(canary: string): string[] {
  const bytes = new TextEncoder().encode(canary);
  const base64 = [0, 1, 2].map((offset) => {
    const shifted = new Uint8Array(offset + bytes.length);
    shifted.set(bytes, offset);
    const encoded = btoa(String.fromCharCode(...shifted));
    return encoded.slice(Math.ceil((offset * 8) / 6), Math.floor((shifted.length * 8) / 6));
  });
  const base64url = base64.map((form) => form.replaceAll("+", "-").replaceAll("/", "_"));
  return [...new Set([...secretTextForms(canary), ...base64, ...base64url])];
}

/**
 * Every text a thrown value carries: for an error its message and stack,
 * every string in its own fields, and the same for each error in its
 * `cause` chain and, for an `AggregateError`, its `errors`. Each object is
 * read once, so a cycle ends.
 *
 * @example
 * errorTexts(new Error("outer", { cause: new Error("inner") })); // includes "outer" and "inner"
 */
export function errorTexts(thrown: unknown): string[] {
  const texts: string[] = [];
  collect(thrown, new Set(), texts);
  return texts;
}

function collect(value: unknown, seen: Set<object>, texts: string[]): void {
  if (typeof value === "string") {
    texts.push(value);
    return;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Error) {
    texts.push(value.message, value.stack ?? "");
    collect(value.cause, seen, texts);
  }
  if (value instanceof AggregateError) {
    for (const inner of value.errors) collect(inner, seen, texts);
  }
  for (const field of Object.values(value)) collect(field, seen, texts);
}
