/**
 * Text the computer sends, as the phone shows it (D7 design on HAL-15159, section 5 item 10, M1
 * and M3). Host text is data: it renders as plain text and never as a link, and nothing in it may
 * hide what the person reads. So every hidden character (bidi overrides and isolates, zero-width
 * and other control characters) shows as a marker like `⟦U+202E⟧`, and a one-line field is cut
 * with a visible "…" once it is longer than its cap.
 */

import { markHiddenName } from "@halonicjs/std";

/** The most characters of a session's title the phone shows, before "…". */
export const hostTitleMax = 120;

/** The most characters of an approval's summary or a row line the phone shows, before "…". */
export const hostLineMax = 400;

const ellipsis = "…";

/**
 * A one-line field (a session's title, an approval's summary, a row line): hidden characters,
 * tab and newline included, as markers, and at most `max` characters of the host's text, with
 * "…" after it when there was more. The cut is made before marking, so a marker is never split.
 *
 * @example
 * hostLine(`Refund${String.fromCodePoint(0x202e)}for Sam`, 40); // "Refund⟦U+202E⟧for Sam"
 */
export function hostLine(text: string, max: number): string {
  const characters = [...text];
  const cut = characters.length > max;
  const kept = cut ? characters.slice(0, max).join("") : text;
  const marked = markHiddenName(kept, { markWhitespace: true });
  return cut ? `${marked}${ellipsis}` : marked;
}

/** A session's title, as {@link hostLine} with {@link hostTitleMax}. */
export function hostTitle(title: string): string {
  return hostLine(title, hostTitleMax);
}

/**
 * A message the agent or the person wrote: its lines kept, every other hidden character as a
 * marker. Not cut: the phone's memory cap bounds it, and the run detail is where it is read whole.
 */
export function hostMessage(text: string): string {
  return markHiddenName(text);
}
