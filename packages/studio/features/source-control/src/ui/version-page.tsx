import { useEffect, useId, useRef } from "react";
import type { Version } from "../api.ts";
import type { ChangesList } from "../changes-list.ts";
import { fullDate } from "../history-days.ts";
import { GoBackBar, GoBackPartialCallout } from "./go-back.tsx";
import { useGoBack } from "./use-go-back.ts";
import { VersionItems } from "./version-items.tsx";

/** Props for {@link VersionPage}. */
export interface VersionPageProps {
  readonly version: Version;
  readonly list: ChangesList;
}

/**
 * A version on a phone, as its own page on the phone's stack (checklist part 2, 2.14): who made it
 * and when, the notes and what's in it, each item with Restore just this, and the bottom bar's Go
 * back to this version. The top bar names the version and has Back, so the page's `h1` is for
 * screen readers only. Focus starts on it, so a screen reader says where it is.
 */
export function VersionPage({ version, list }: VersionPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const headingId = useId();
  const going = useGoBack(list);
  return (
    <section aria-labelledby={headingId} className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <GoBackPartialCallout going={going} />
        <h1 id={headingId} ref={heading} tabIndex={-1} className="sr-only">
          {version.name}
        </h1>
        <VersionFacts version={version} list={list} level="page" />
      </div>
      <GoBackBar version={version} list={list} going={going} />
    </section>
  );
}

/** The level of What's in it, one below the version's name. */
const whatsInItLevel = { page: 2, pane: 3, details: 4 } as const;

/**
 * Who made a version and when, its notes and what's in it: under the `h1` on the phone's version
 * page, the `h3` of History's details box, or the `h2` of the desktop's content pane.
 */
export function VersionFacts({
  version,
  list,
  level,
}: {
  readonly version: Version;
  readonly list: ChangesList;
  /** "page" puts What's in it under an `h2`; "pane" under an `h3`; "details" under an `h4`. */
  readonly level: "page" | "pane" | "details";
}) {
  return (
    <>
      <p className="text-small text-fg-muted">
        {version.author} · {fullDate(version.at)}
      </p>
      {version.notes === "" ? null : (
        <p className="text-body whitespace-pre-wrap">{version.notes}</p>
      )}
      <VersionItems version={version} list={list} headingLevel={whatsInItLevel[level]} />
    </>
  );
}
