import { type HiddenSegment, segmentHidden } from "@halonicjs/std";

/** A piece of a value as the card shows it: text as written, or a marker for a hidden character. */
export type PlainSegment = HiddenSegment;

/** A value split into what the card shows, and whether it held a hidden character. */
export interface MarkedText {
  readonly segments: readonly PlainSegment[];
  /** True when at least one marker is in `segments`; the card then adds the line below. */
  readonly hasHidden: boolean;
}

/** The line the card adds under a value with a marker (INBOX-CARD-28). */
export const hiddenCharactersLine = "Contains hidden or direction-changing characters";

/**
 * Splits a value into text and markers (`segmentHidden`), so a hidden character shows as
 * `⟦U+202E⟧` instead of acting on the text around it, and says whether it held one.
 *
 * @example
 * markHidden("Refund\u202Efor Sam").hasHidden; // true
 */
export function markHidden(value: string): MarkedText {
  const segments = segmentHidden(value);
  return { segments, hasHidden: segments.some((segment) => segment.kind === "marker") };
}
