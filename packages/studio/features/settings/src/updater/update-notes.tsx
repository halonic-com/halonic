import { ExternalLink } from "@halonicjs/studio-kit";
import { useId } from "react";
import * as text from "./update-dialog-text.ts";

/**
 * What changed in an update, under a heading, with its release page. The notes come from the
 * update's manifest, which isn't signed, so they are only ever a text node: no Markdown, no HTML
 * and no links made from them (HAL-19365). The box scrolls, so it takes focus for the keyboard.
 * With neither notes nor a release page there is nothing to point at, so it draws nothing.
 */
export function UpdateNotes({
  heading,
  notes,
  notesUrl,
}: {
  readonly heading: string;
  readonly notes: string | null;
  readonly notesUrl: string | null;
}) {
  const headingId = useId();
  if (notes === null && notesUrl === null) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-body-strong text-fg">
        {heading}
      </h3>
      {notes === null ? (
        <p className="text-small text-fg-muted">{text.NO_NOTES}</p>
      ) : (
        <section
          aria-labelledby={headingId}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller must be a Tab stop to scroll by keyboard in WebKit.
          tabIndex={0}
          className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 text-small"
        >
          {notes}
        </section>
      )}
      {notesUrl === null ? null : (
        <p className="text-small">
          <ExternalLink href={notesUrl}>{text.RELEASE_NOTES}</ExternalLink>
        </p>
      )}
    </section>
  );
}
