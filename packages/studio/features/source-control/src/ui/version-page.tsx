import { Button } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import type { Version } from "../api.ts";
import { historyWords } from "../changes-words.ts";
import { fullDate } from "../history-days.ts";

/** Props for {@link VersionPage}. */
export interface VersionPageProps {
  readonly version: Version;
  readonly onBack: () => void;
}

/**
 * A version on a phone, as its own page (checklist part 2, 2.14): Back to History, the version's
 * name as the `h1`, who and when, the notes and what's in it. Focus starts on the heading, so a
 * screen reader says where it is.
 *
 * Not here yet: Restore just this, and the bottom bar's Go back to this version.
 */
export function VersionPage({ version, onBack }: VersionPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <span className="self-start">
        <Button variant="ghost" size="touch" onClick={onBack}>
          {historyWords.back}
        </Button>
      </span>
      <h1 id={headingId} ref={heading} tabIndex={-1} className="text-title outline-none">
        {version.name}
      </h1>
      <VersionFacts version={version} level="page" />
    </section>
  );
}

/**
 * Who made a version and when, its notes and what's in it: under the `h1` on the phone's version
 * page, or under the `h3` of the desktop's details box.
 */
export function VersionFacts({
  version,
  level,
}: {
  readonly version: Version;
  /** "page" puts What's in it under an `h2`; "details" under an `h4`. */
  readonly level: "page" | "details";
}) {
  const WhatsInItHeading = level === "page" ? "h2" : "h4";
  return (
    <>
      <p className="text-small text-fg-muted">
        {version.author} · {fullDate(version.at)}
      </p>
      {version.notes === "" ? null : (
        <p className="text-body whitespace-pre-wrap">{version.notes}</p>
      )}
      <WhatsInItHeading className="text-label text-fg-muted">
        {historyWords.whatsInIt} · {historyWords.fileCount(version.files.length)}
      </WhatsInItHeading>
      {version.files.length === 0 ? (
        <p className="text-body text-fg-muted">{historyWords.noFiles}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {version.files.map((path) => (
            <li key={path} className="text-body break-all">
              {path}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
