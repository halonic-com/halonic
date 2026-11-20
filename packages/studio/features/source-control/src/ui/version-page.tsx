import { Button } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import type { Version } from "../api.ts";
import type { ChangesList } from "../changes-list.ts";
import { historyWords } from "../changes-words.ts";
import { fullDate } from "../history-days.ts";
import { GoBackBar, GoBackPartialCallout } from "./go-back.tsx";
import { useGoBack } from "./use-go-back.ts";
import { VersionItems } from "./version-items.tsx";

/** Props for {@link VersionPage}. */
export interface VersionPageProps {
  readonly version: Version;
  readonly list: ChangesList;
  readonly onBack: () => void;
}

/**
 * A version on a phone, as its own page (checklist part 2, 2.14): Back to History, the version's
 * name as the `h1`, who and when, the notes and what's in it, each item with Restore just this,
 * and the bottom bar's Go back to this version. Focus starts on the heading, so a screen reader
 * says where it is.
 */
export function VersionPage({ version, list, onBack }: VersionPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const headingId = useId();
  const going = useGoBack(list);
  return (
    <section aria-labelledby={headingId} className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <span className="self-start">
          <Button variant="ghost" size="touch" onClick={onBack}>
            {historyWords.back}
          </Button>
        </span>
        <GoBackPartialCallout going={going} />
        <h1 id={headingId} ref={heading} tabIndex={-1} className="text-title">
          {version.name}
        </h1>
        <VersionFacts version={version} list={list} level="page" />
      </div>
      <GoBackBar version={version} list={list} going={going} />
    </section>
  );
}

/**
 * Who made a version and when, its notes and what's in it: under the `h1` on the phone's version
 * page, or under the `h3` of the desktop's details box.
 */
export function VersionFacts({
  version,
  list,
  level,
}: {
  readonly version: Version;
  readonly list: ChangesList;
  /** "page" puts What's in it under an `h2`; "details" under an `h4`. */
  readonly level: "page" | "details";
}) {
  return (
    <>
      <p className="text-small text-fg-muted">
        {version.author} · {fullDate(version.at)}
      </p>
      {version.notes === "" ? null : (
        <p className="text-body whitespace-pre-wrap">{version.notes}</p>
      )}
      <VersionItems version={version} list={list} headingLevel={level === "page" ? 2 : 4} />
    </>
  );
}
