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
 * (U+000A), zero-width characters, direction overrides and isolates, the
 * byte order mark and Unicode tag characters. Written as numbers, so the
 * source holds no invisible character itself.
 */
const hiddenRanges: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008],
  [0x000b, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200d],
  [0x202a, 0x202e],
  [0x2060, 0x2060],
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

function isHidden(point: number): boolean {
  return hiddenRanges.some(([first, last]) => point >= first && point <= last);
}

function codeOf(point: number): string {
  return `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
}
