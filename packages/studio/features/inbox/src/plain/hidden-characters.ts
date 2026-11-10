/** A piece of a value as the card shows it: text as written, or a marker for a hidden character. */
export type PlainSegment =
  | { readonly kind: "text"; readonly text: string }
  /** `code` is the character's name, such as `U+202E`; the card shows it as `⟦U+202E⟧`. */
  | { readonly kind: "marker"; readonly code: string };

/** A value split into what the card shows, and whether it held a hidden character. */
export interface MarkedText {
  readonly segments: readonly PlainSegment[];
  /** True when at least one marker is in `segments`; the card then adds the line below. */
  readonly hasHidden: boolean;
}

/** The line the card adds under a value with a marker (INBOX-CARD-28). */
export const hiddenCharactersLine = "Contains hidden or direction-changing characters";

/**
 * The code point ranges a value can carry without anyone seeing them
 * (INBOX-CARD-28): control characters other than tab (U+0009) and newline
 * (U+000A), the soft hyphen, zero-width characters, direction marks,
 * overrides and isolates, the word joiner and invisible operators, the byte
 * order mark and Unicode tag characters. Written as numbers, so the source
 * holds no invisible character itself.
 */
const hiddenRanges: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008],
  [0x000b, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
  [0xe0000, 0xe007f],
];

/**
 * Splits a value into text and markers, so a hidden character shows as
 * `⟦U+202E⟧` instead of acting on the text around it. A Windows line end
 * (`\r\n`) counts as a newline; a `\r` on its own is marked.
 *
 * @example
 * markHidden("Refund\u202Efor Sam").segments;
 * // [{ kind: "text", text: "Refund" }, { kind: "marker", code: "U+202E" }, { kind: "text", text: "for Sam" }]
 */
export function markHidden(value: string): MarkedText {
  const segments: PlainSegment[] = [];
  let text = "";
  for (const character of value.replace(/\r\n/g, "\n")) {
    const point = character.codePointAt(0) ?? 0;
    if (!isHidden(point)) {
      text += character;
      continue;
    }
    if (text !== "") segments.push({ kind: "text", text });
    text = "";
    segments.push({ kind: "marker", code: codeOf(point) });
  }
  if (text !== "") segments.push({ kind: "text", text });
  return { segments, hasHidden: segments.some((segment) => segment.kind === "marker") };
}

/** The marker's text as the card shows it, such as `⟦U+202E⟧`. */
export function markerText(code: string): string {
  return `⟦${code}⟧`;
}

/**
 * A short name from the run, such as an argument, tool or connector name, as one
 * string with every hidden character written out as its marker. The agent and
 * the MCP server choose these names, so they get markers like a value.
 *
 * @example
 * markedName(`create${String.fromCodePoint(0x200b)}note`); // "create⟦U+200B⟧note"
 */
export function markedName(value: string): string {
  return markHidden(value)
    .segments.map((segment) => (segment.kind === "text" ? segment.text : markerText(segment.code)))
    .join("");
}

/**
 * JSON text with every hidden character written as a `\uXXXX` escape, so the
 * raw JSON shows it too and stays the same JSON. A character above U+FFFF,
 * such as a tag character, becomes its two UTF-16 escapes. Hidden characters
 * can only stand inside JSON strings, where an escape means the same.
 *
 * @example
 * escapeHidden(JSON.stringify(`Refund${String.fromCodePoint(0x202e)}for Sam`)); // '"Refund\\u202efor Sam"'
 */
export function escapeHidden(json: string): string {
  let escaped = "";
  for (const character of json) {
    const point = character.codePointAt(0) ?? 0;
    if (!isHidden(point)) {
      escaped += character;
      continue;
    }
    for (let index = 0; index < character.length; index++) {
      escaped += `\\u${character.charCodeAt(index).toString(16).padStart(4, "0")}`;
    }
  }
  return escaped;
}

function isHidden(point: number): boolean {
  return hiddenRanges.some(([first, last]) => point >= first && point <= last);
}

function codeOf(point: number): string {
  return `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
}
