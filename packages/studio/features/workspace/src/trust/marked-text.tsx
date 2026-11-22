// Text from the workspace in the trust check, with each hidden character written out as a marker.

import { isHiddenCharacter } from "@halonicjs/std";
import { Fragment } from "react";

/**
 * Whether the check writes a character out: every hidden character, as the plugin trust check and
 * the Inbox mark them, and also tab and newline, which a one-line value would show as a space.
 */
function isMarked(point: number): boolean {
  return point === 0x09 || point === 0x0a || isHiddenCharacter(point);
}

/** `⟦U+202E⟧`: a character's marker, in the form the plugin trust check and the Inbox use. */
function markerOf(point: number): string {
  return `⟦U+${point.toString(16).toUpperCase().padStart(4, "0")}⟧`;
}

/** A value split into text as written and markers, in order. */
function segmentsOf(value: string): { readonly text: string; readonly marker: boolean }[] {
  const segments: { text: string; marker: boolean }[] = [];
  let text = "";
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (!isMarked(point)) {
      text += character;
      continue;
    }
    if (text !== "") segments.push({ text, marker: false });
    text = "";
    segments.push({ text: markerOf(point), marker: true });
  }
  if (text !== "") segments.push({ text, marker: false });
  return segments;
}

/**
 * A text with each hidden character as a marker, for a place that takes a string only, such as
 * the dialog's title.
 *
 * @example
 * markedText("Trust Ac\u202eme?"); // "Trust Ac⟦U+202E⟧me?"
 */
export function markedText(value: string): string {
  return segmentsOf(value)
    .map((segment) => segment.text)
    .join("");
}

/**
 * A text with each hidden character as a marker in amber, the dialog's warning colour, so a
 * zero-width or direction-changing character reads as a warning instead of acting on the text
 * around it (mockup-trust section 5, "Hidden characters as visible tokens").
 */
export function Marked({ text }: { readonly text: string }) {
  // The segments never reorder, so each one's place is its key.
  return segmentsOf(text).map((segment, index) =>
    segment.marker ? (
      <span key={index} className="text-attention">
        {segment.text}
      </span>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  );
}
