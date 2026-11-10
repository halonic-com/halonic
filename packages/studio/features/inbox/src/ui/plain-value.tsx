import { Button } from "@halonicjs/studio-kit";
import { useState } from "react";
import { foldLabel, foldText, isFolded } from "../plain/fold.ts";
import { hiddenCharactersLine, markerText, markHidden } from "../plain/hidden-characters.ts";

export interface PlainValueProps {
  /** Model output, such as an argument or a wait step's body. Never read as Markdown or HTML. */
  readonly text: string;
}

/**
 * A value from a run, as plain text (INBOX-CARD-27 and 28, `inbox.plain-values`): React text
 * only, in its own isolated direction, with hidden characters as `⟦U+202E⟧` markers and long
 * text folded behind "Show 38 more lines". It wraps and never scrolls sideways.
 */
export function PlainValue({ text }: PlainValueProps) {
  const [open, setOpen] = useState(false);
  const folded = foldText(text);
  const shown = open ? folded.full : folded.shown;
  const marked = markHidden(shown);
  // From the value as sent: folding can drop a hidden character, such as a line of
  // U+FEFF counted into "⟦4 empty lines⟧", and the warning must still show.
  const hasHidden = marked.hasHidden || markHidden(text).hasHidden;
  const label = foldLabel(folded);
  return (
    <div className="min-w-0">
      <bdi className="block whitespace-pre-wrap wrap-anywhere text-fg">
        {marked.segments.map((segment, index) =>
          segment.kind === "text" ? (
            <span key={index}>{segment.text}</span>
          ) : (
            <span
              key={index}
              className="rounded-xs bg-surface-muted px-0.5 font-mono text-code text-fg-muted"
            >
              {markerText(segment.code)}
            </span>
          ),
        )}
      </bdi>
      {hasHidden ? <p className="mt-1 text-small text-fg-muted">{hiddenCharactersLine}</p> : null}
      {isFolded(folded) && !open ? (
        <div className="mt-1 -ml-2.5">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            {label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
