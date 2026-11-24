// The name a phone gives itself, the one text in the pairing dialog that comes from outside.

import { hiddenMarker, markHiddenName, segmentHidden } from "@halonicjs/std";
import { Fragment } from "react";

/** The most characters of a phone's name the dialog shows; a longer one ends in "…". */
export const PHONE_NAME_LIMIT = 64;

/** A name is one line, so tab and newline are marked too, as the trust check marks them. */
const options = { markWhitespace: true } as const;

/** The name cut to {@link PHONE_NAME_LIMIT} characters, counting code points, so no pair is split. */
function capped(name: string): string {
  const characters = Array.from(name);
  if (characters.length <= PHONE_NAME_LIMIT) return name;
  return `${characters.slice(0, PHONE_NAME_LIMIT).join("")}…`;
}

/**
 * The phone's name as one string, capped, with each hidden character written out as a marker,
 * for a place that takes a string only, such as a title.
 *
 * @example
 * phoneNameText(`Pixel${String.fromCodePoint(0x202e)}8`); // "Pixel⟦U+202E⟧8"
 */
export function phoneNameText(name: string): string {
  return markHiddenName(capped(name), options);
}

/**
 * The phone's name, capped, with each hidden character as a marker in amber, so a zero-width or
 * direction-changing character reads as a warning instead of changing how the name looks.
 */
export function PhoneName({ name }: { readonly name: string }) {
  // The segments never reorder, so each one's place is its key.
  return segmentHidden(capped(name), options).map((segment, index) =>
    segment.kind === "marker" ? (
      <span key={index} className="text-attention">
        {hiddenMarker(segment.code)}
      </span>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  );
}
