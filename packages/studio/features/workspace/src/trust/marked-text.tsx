// Text from the workspace in the trust check, with each hidden character written out as a marker.

import { hiddenMarker, markHiddenName, segmentHidden } from "@halonicjs/std";
import { Fragment } from "react";

/**
 * The check marks every hidden character, as the plugin trust check and the Inbox do, and also
 * tab and newline, which a one-line value would show as a space.
 */
const options = { markWhitespace: true } as const;

/**
 * A text with each hidden character as a marker, for a place that takes a string only, such as
 * the dialog's title.
 *
 * @example
 * markedText("Trust Ac\u202eme?"); // "Trust Ac⟦U+202E⟧me?"
 */
export function markedText(value: string): string {
  return markHiddenName(value, options);
}

/**
 * A text with each hidden character as a marker in amber, the dialog's warning colour, so a
 * zero-width or direction-changing character reads as a warning instead of acting on the text
 * around it (mockup-trust section 5, "Hidden characters as visible tokens").
 */
export function Marked({ text }: { readonly text: string }) {
  // The segments never reorder, so each one's place is its key.
  return segmentHidden(text, options).map((segment, index) =>
    segment.kind === "marker" ? (
      <span key={index} className="text-attention">
        {hiddenMarker(segment.code)}
      </span>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  );
}
