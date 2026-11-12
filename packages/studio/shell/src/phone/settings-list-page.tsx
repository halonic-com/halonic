import {
  ChevronRightIcon,
  List,
  type ListGroup,
  type ListRow,
  SettingsIcon,
} from "@halonicjs/studio-kit";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SettingsSectionContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { listedSections, type SettingsPlace, settingsGroups } from "../settings/settings-groups.ts";
import type { TabLocation } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/** Props for {@link SettingsListPage}. */
export interface SettingsListPageProps {
  /** The sections features added, as `shell.contributions.settings.list()` gives them. */
  readonly sections: readonly Registered<SettingsSectionContribution>[];
  /** The open workspace's name, or `undefined` when none is open. */
  readonly workspaceName: string | undefined;
  readonly place: SettingsPlace;
  /** The context a section's `summary` reads its values from, as the window gives its view. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /**
   * Where the list's scroll position is kept while a section's page is open above it, so Back
   * returns to the same place (UX 3.6). The window owns it, as each page is drawn fresh.
   */
  readonly scroll: RefObject<number>;
  /** A row's tap. The caller opens the section's page above this one (`sectionLocation`). */
  readonly onOpen: (section: Registered<SettingsSectionContribution>) => void;
}

/** The location of a Settings section's page on the phone: `settings/<id>`, under the list's. */
export function sectionLocation(section: {
  readonly id: string;
  readonly title: string;
}): TabLocation {
  return { key: `settings/${section.id}`, title: section.title };
}

/** The section id a phone page key opens, or `undefined` when the key is not a section's page. */
export function sectionIdOfLocationKey(key: string): string | undefined {
  return key.startsWith("settings/") ? key.slice("settings/".length) : undefined;
}

/** A section's row summaries by section id: the one-line values, once each has answered. */
type Summaries = Readonly<Record<string, string | undefined>>;

/**
 * The summaries the sections give, as the list shows them. One that answers at once is there on the
 * first draw; one that answers later fills in when it does; one that fails keeps the line it had.
 * `pending` is whether any is still on its way.
 */
function useSummaries(
  sections: readonly Registered<SettingsSectionContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
) {
  const [shown, setShown] = useState(() => firstSummaries(sections, contextFor));
  // The window gives a new array each draw, so the sections are asked again only when they change.
  const latest = useRef(sections);
  latest.current = sections;
  const key = sections.map((section) => section.id).join("\0");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `sections`, see above.
  useEffect(() => {
    let current = true;
    const answers: Promise<readonly [string, string | undefined] | undefined>[] = [];
    for (const section of latest.current) {
      const answer = readSummary(section, contextFor);
      if (answer instanceof Promise) {
        answers.push(
          answer.then(
            (line) => [section.id, line] as const,
            () => undefined,
          ),
        );
      }
    }
    if (answers.length === 0) {
      return;
    }
    void Promise.all(answers).then((settled) => {
      if (!current) {
        return;
      }
      setShown((last) => {
        const next: Record<string, string | undefined> = { ...last.summaries };
        for (const entry of settled) {
          if (entry !== undefined) {
            next[entry[0]] = entry[1];
          }
        }
        return { summaries: next, pending: false };
      });
    });
    return () => {
      current = false;
    };
  }, [key, contextFor]);
  return shown;
}

function readSummary(
  section: Registered<SettingsSectionContribution>,
  contextFor: (featureId: string) => WorkspaceContext,
): string | undefined | Promise<string | undefined> {
  try {
    return section.summary?.(contextFor(section.featureId));
  } catch {
    return undefined;
  }
}

/** What the sections answer at once, and whether any answers later. */
function firstSummaries(
  sections: readonly Registered<SettingsSectionContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): { summaries: Summaries; pending: boolean } {
  const summaries: Record<string, string | undefined> = {};
  let pending = false;
  for (const section of sections) {
    const answer = readSummary(section, contextFor);
    if (answer instanceof Promise) {
      pending = true;
    } else {
      summaries[section.id] = answer;
    }
  }
  return { summaries, pending };
}

/**
 * Keeps the page's scroll position in `scroll` while it is open, and puts it back when the page is
 * drawn again, as Back from a section's page does. The scroller is the window's `main`.
 */
function useKeptScroll(scroll: RefObject<number>) {
  const page = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroller = page.current?.closest("main");
    if (scroller === null || scroller === undefined) {
      return;
    }
    scroller.scrollTop = scroll.current;
    const remember = () => {
      scroll.current = scroller.scrollTop;
    };
    scroller.addEventListener("scroll", remember);
    return () => scroller.removeEventListener("scroll", remember);
  }, [scroll]);
  return page;
}

const metaOf = (summary: string | undefined) => (summary === undefined ? {} : { meta: summary });

/**
 * The phone's Settings list page (flow-settings 13, UX checklist 3.23, `shell.settings-list-page`):
 * the sections the window has, under headings by where each one's values are kept: the workspace's
 * ("Acme · workspace settings"), "On this phone" and "On your computer". Developer, and any
 * section with `phone: false`, is never listed. Each row is a 56px row with an icon, the section's
 * name, its one-line summary (`summary`) and a chevron, and is named by the name and the summary.
 * A tap passes the section on, and the caller opens it as the next page on the More stack. The
 * top bar already says "Settings", so the page's `h1` is for screen readers only. While a summary
 * is on its way, the page says "Loading settings" to screen readers.
 *
 * @example
 * <SettingsListPage sections={shell.contributions.settings.list()} workspaceName="Acme" place="served"
 *   contextFor={contextFor} scroll={scroll} onOpen={(section) => phone.open(sectionLocation(section))} />
 */
export function SettingsListPage({
  sections,
  workspaceName,
  place,
  contextFor,
  scroll,
  onOpen,
}: SettingsListPageProps) {
  const groups = settingsGroups({ sections, workspaceName, place, phone: true });
  const listed = listedSections(groups);
  const { summaries, pending } = useSummaries(listed, contextFor);
  const page = useKeptScroll(scroll);
  const rowOf = (section: Registered<SettingsSectionContribution>): ListRow => ({
    id: section.id,
    title: section.title,
    ...metaOf(summaries[section.id]),
    icon: <SettingsIcon />,
    trailing: (
      <span aria-hidden="true" className="size-icon-md text-fg-subtle *:size-full">
        <ChevronRightIcon />
      </span>
    ),
  });
  const listGroups: readonly ListGroup[] = groups.map((group) => ({
    id: group.key,
    heading: { name: group.name, ...(group.detail === undefined ? {} : { detail: group.detail }) },
    rows: group.sections.map(rowOf),
  }));
  return (
    <div ref={page} className="flex flex-col">
      <h1 tabIndex={-1} className="sr-only">
        Settings
      </h1>
      {pending ? (
        <p role="status" className="sr-only">
          Loading settings
        </p>
      ) : null}
      <List
        label="Settings"
        groups={listGroups}
        flush
        onOpen={(id) => {
          const section = listed.find((candidate) => candidate.id === id);
          if (section !== undefined) {
            onOpen(section);
          }
        }}
      />
    </div>
  );
}
