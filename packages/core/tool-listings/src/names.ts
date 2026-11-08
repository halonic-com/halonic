import { maxNameLength } from "./limits.ts";

const namePattern = new RegExp(`^[A-Za-z0-9_-]{1,${maxNameLength}}$`);

/**
 * Whether a string the model sends back in calls, and so can't be fenced,
 * is safe to show unfenced: 1 to 64 letters, digits, `_` or `-`.
 *
 * @param value - a tool name, property name, `required` string, `$defs` name or `enum`/`const` string
 */
export function passesNameRule(value: string): boolean {
  return namePattern.test(value);
}

const maxQuotedLength = 64;

/**
 * Puts text from a listing into a refusal reason: cut to 64 characters and
 * quoted, with quotes, backslashes and every character outside printable
 * ASCII escaped. A reason stays one plain line whatever the server sent.
 *
 * @example
 * quote('say "hi"\n'); // => "say \"hi\"\u{a}"
 */
export function quote(text: string): string {
  let escaped = "";
  let count = 0;
  for (const character of text) {
    if (count === maxQuotedLength) {
      return `"${escaped}"...`;
    }
    escaped += escapeCharacter(character);
    count += 1;
  }
  return `"${escaped}"`;
}

function escapeCharacter(character: string): string {
  if (character === '"' || character === "\\") {
    return `\\${character}`;
  }
  const codePoint = character.codePointAt(0) ?? 0;
  const isPrintableAscii = codePoint >= 0x20 && codePoint <= 0x7e;
  if (isPrintableAscii) {
    return character;
  }
  return `\\u{${codePoint.toString(16)}}`;
}

/** A JSON Pointer to a place in the parameters, as a refusal shows it. */
export function showPath(path: string): string {
  return path === "" ? "the root" : path;
}
