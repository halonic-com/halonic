import { Fragment } from "react";
import { type HostText, hiddenCharacterWords } from "./host-text.ts";

/**
 * Host text on screen (HAL-16957): its text as written, and each hidden character as a small chip
 * with its code, such as `U+202E`, that a screen reader reads as "hidden character U+202E". A
 * chip is its own element, not characters in the string: Inter draws no `⟦⟧`, and text the host
 * typed to look like a marker stays plain text, so it never looks like a chip.
 */
export function HostTextView({ text }: { readonly text: HostText }) {
  return text.map((part, index) =>
    part.kind === "text" ? (
      // The parts never move, so their place is their key.
      <Fragment key={index}>{part.text}</Fragment>
    ) : (
      <HiddenCharacterChip key={index} code={part.code} />
    ),
  );
}

/** One hidden character: its code in a mono caption chip, in the line's own text colour. */
function HiddenCharacterChip({ code }: { readonly code: string }) {
  return (
    <span className="rounded-sm border border-border bg-surface-muted px-1 font-mono text-caption">
      <span className="sr-only">{`${hiddenCharacterWords} `}</span>
      {code}
    </span>
  );
}
