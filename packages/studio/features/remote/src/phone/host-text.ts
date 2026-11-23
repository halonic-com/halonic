/**
 * Text the computer sends, as the phone shows it (D7 design on HAL-15159, section 5 item 10, M1
 * and M3). Host text is data: it renders as plain text and never as a link, and nothing in it may
 * hide what the person reads. So every hidden character (bidi overrides and isolates, zero-width
 * and other control characters) shows as a marker, and a one-line field is cut with a visible "…"
 * once it is longer than its cap.
 *
 * A marker is kept apart from the text around it ({@link HostText}), so the screen draws it as a
 * chip (`HostTextView`) and text the host typed to look like a marker stays plain text (HAL-16957).
 * Where only a string fits, such as a kit component's words, {@link hostShown} writes the marker
 * as `⟦U+202E⟧`, and {@link hostSpoken} as "hidden character U+202E" for a screen reader.
 */

import { type HiddenSegment, hiddenMarker, segmentHidden } from "@halonicjs/std";

/** The most characters of a session's title the phone shows, before "…". */
export const hostTitleMax = 120;

/** The most characters of an approval's summary or a row line the phone shows, before "…". */
export const hostLineMax = 400;

/**
 * The most characters of a session's title in the prompt box's placeholder, so "Message {title}…"
 * stays on one line (HAL-16957).
 */
export const hostPlaceholderTitleMax = 40;

/** Host text in parts: text as written, and a marker for each hidden character. */
export type HostText = readonly HiddenSegment[];

const ellipsis = "…";

/**
 * A one-line field (a session's title, an approval's summary, a row line) in parts: hidden
 * characters, tab and newline included, as markers, and at most `max` characters of the host's
 * text, with "…" after it when there was more. The cut is made before marking, so a marker is
 * never split.
 *
 * @example
 * hostLineParts(`Refund${String.fromCodePoint(0x202e)}for Sam`, 40);
 * // [{ kind: "text", text: "Refund" }, { kind: "marker", code: "U+202E" }, { kind: "text", text: "for Sam" }]
 */
export function hostLineParts(text: string, max: number): HostText {
  const characters = [...text];
  const cut = characters.length > max;
  // A cut right after a space would leave "summary …", so the "…" goes straight after the last
  // word. Only spaces go: a tab or newline there is hidden and keeps its marker.
  const kept = cut ? characters.slice(0, max).join("").replace(/ +$/u, "") : text;
  const parts = segmentHidden(kept, { markWhitespace: true });
  return cut ? hostAppend(parts, ellipsis) : parts;
}

/** A session's title in parts, as {@link hostLineParts} with {@link hostTitleMax}. */
export function hostTitleParts(title: string): HostText {
  return hostLineParts(title, hostTitleMax);
}

/**
 * A message the agent or the person wrote, in parts: its lines kept, every other hidden character
 * as a marker. Not cut: the phone's memory cap bounds it, and the run detail is where it is read
 * whole.
 */
export function hostMessageParts(text: string): HostText {
  return segmentHidden(text);
}

/** Words of our own as host text, with no markers: "Working as of 14:02." */
export function hostPlain(text: string): HostText {
  return [{ kind: "text", text }];
}

/** Stands for the host text while {@link hostFill} writes the words around it. */
const slot = "\u{F0000}";

/**
 * `words` with host text in it, such as "{agent} is working…" with the agent's title, so its
 * markers stay chips. `words` puts its argument in at most once.
 *
 * @example
 * hostFill((agent) => `${agent} is working…`, hostTitleParts(title));
 */
export function hostFill(words: (name: string) => string, name: HostText): HostText {
  const [before = "", after] = words(slot).split(slot);
  if (after === undefined) return hostPlain(before);
  return [...hostPlain(before), ...name, ...hostPlain(after)].filter(
    (part) => part.kind !== "text" || part.text !== "",
  );
}

/** `parts` with `text` after them, such as " · as of 14:02". */
export function hostAppend(parts: HostText, text: string): HostText {
  return [...parts, { kind: "text", text }];
}

/**
 * Host text as one string to show, each marker written as `⟦U+202E⟧`: for a place that takes only
 * words, where a marker can't be drawn as a chip.
 */
export function hostShown(parts: HostText): string {
  return parts.map((part) => (part.kind === "text" ? part.text : hiddenMarker(part.code))).join("");
}

/** What a screen reader says before a marker's code: "hidden character U+202E". */
export const hiddenCharacterWords = "hidden character";

/** Host text as one string to say, each marker as "hidden character U+202E", set off by spaces. */
export function hostSpoken(parts: HostText): string {
  return parts
    .map((part) => (part.kind === "text" ? part.text : ` ${hiddenCharacterWords} ${part.code} `))
    .join("")
    .trim();
}

/**
 * A one-line field as one string, as {@link hostLineParts} writes it with {@link hostShown}.
 *
 * @example
 * hostLine(`Refund${String.fromCodePoint(0x202e)}for Sam`, 40); // "Refund⟦U+202E⟧for Sam"
 */
export function hostLine(text: string, max: number): string {
  return hostShown(hostLineParts(text, max));
}

/** A session's title as one string, as {@link hostLine} with {@link hostTitleMax}. */
export function hostTitle(title: string): string {
  return hostLine(title, hostTitleMax);
}

/** A message as one string, as {@link hostMessageParts} writes it with {@link hostShown}. */
export function hostMessage(text: string): string {
  return hostShown(hostMessageParts(text));
}
