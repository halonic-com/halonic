import { ExternalLink } from "@halonicjs/studio-kit";
import { useId } from "react";
import { versionHeading } from "./about-text.ts";
import * as text from "./update-dialog-text.ts";
import type { VersionNotes } from "./updater-status.ts";

/**
 * What changed in an update, under a heading, with its release page. The notes come from the
 * update's manifest, which isn't signed, so they are only ever a text node: no Markdown, no HTML
 * and no links made from them (HAL-19365). With several versions, each one's notes stand under its
 * version, newest first (HAL-19545). The box scrolls, so it takes focus for the keyboard. With
 * neither notes nor a release page there is nothing to point at, so it draws nothing.
 */
export function UpdateNotes({
  heading,
  notes,
  older = false,
  notesUrl,
}: {
  readonly heading: string;
  /** Each version's notes, newest first. */
  readonly notes: readonly VersionNotes[];
  /** The list stops above the installed version: says the release notes have the rest. */
  readonly older?: boolean;
  readonly notesUrl: string | null;
}) {
  const headingId = useId();
  if (notes.length === 0 && notesUrl === null) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-body-strong text-fg">
        {heading}
      </h3>
      {notes.length === 0 ? (
        <p className="text-small text-fg-muted">{text.NO_NOTES}</p>
      ) : (
        <section
          aria-labelledby={headingId}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller must be a Tab stop to scroll by keyboard in WebKit.
          tabIndex={0}
          className="flex max-h-60 flex-col gap-3 overflow-y-auto rounded-md bg-surface-muted p-3 text-small"
        >
          {notes.length === 1 ? (
            <p className="whitespace-pre-wrap">{notes[0]?.notes}</p>
          ) : (
            notes.map((entry) => (
              <div key={entry.version} className="flex flex-col gap-1">
                <h4 className="font-medium">{versionHeading(entry.version)}</h4>
                <p className="whitespace-pre-wrap">{entry.notes}</p>
              </div>
            ))
          )}
        </section>
      )}
      {older ? <p className="text-small text-fg-muted">{text.OLDER_NOTES}</p> : null}
      {notesUrl === null ? null : (
        <p className="text-small">
          <ExternalLink href={notesUrl}>{text.RELEASE_NOTES}</ExternalLink>
        </p>
      )}
    </section>
  );
}
