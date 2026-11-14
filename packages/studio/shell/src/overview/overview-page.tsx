import { EmptyState, Input, List, type ListRow, SearchIcon } from "@halonicjs/studio-kit";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import {
  allFilter,
  type OverviewHub,
  type OverviewSection,
  type OverviewShared,
  overviewSections,
} from "./overview-model.ts";

/**
 * The words the page can't know: each feature passes its own, in the product's voice. The shell
 * adds none but the "Try again" the shell's other pages share, so a Library word never lands in a
 * hub list.
 */
export interface OverviewWords {
  /** The search field's name: "Search for skills". */
  readonly searchLabel: string;
  /** What screen readers hear while the items load: "Loading skills". */
  readonly loadingLabel: string;
  /** The heading of the shared section: "Shared in Acme". */
  readonly sharedSection: (workspaceName: string) => string;
  /** A hub with no items, in its own section: "No skills in acme yet". */
  readonly emptySection: (sectionName: string) => string;
  /** Nothing matches the search: "No results for “sorter”". */
  readonly noMatch: (query: string) => string;
  /** No hub and nothing shared: "No skills yet". */
  readonly nothingYet: { readonly title: string; readonly description?: string };
}

/** Why the items couldn't load, shown in place of the list. */
export interface OverviewFailure {
  /** "Couldn't load skills". */
  readonly title: string;
  /** The reason, one sentence ending in a full stop. */
  readonly reason?: string;
  readonly onTryAgain: () => void;
}

/** The props of {@link OverviewPage}. */
export interface OverviewPageProps {
  readonly hubs: readonly OverviewHub[];
  readonly shared?: OverviewShared;
  readonly words: OverviewWords;
  /** Enter or a click on a row. */
  readonly onOpen: (id: string) => void;
  /** Ctrl Enter, a Ctrl-click or a middle click on a row. */
  readonly onOpenInNewTab: (id: string) => void;
  /** The items are on their way. */
  readonly loading?: boolean;
  readonly failure?: OverviewFailure;
  /** A tab list the feature draws above the search field, as the Library's four tabs. */
  readonly tabs?: ReactNode;
}

function rowsOf(section: OverviewSection): readonly ListRow[] {
  return section.items.map((item) => ({
    id: item.id,
    title: item.name,
    ...(item.detail === undefined ? {} : { meta: item.detail }),
  }));
}

/**
 * The list page of a hub's items, shared by every feature that has one: Skills, Agents, Routines.
 * The feature gives it the data and the words. The page owns the layout: the search field, one
 * section per hub, the shared section, and the loading, empty, no-match and failed states.
 *
 * @example
 * <OverviewPage hubs={hubs} words={skillWords} onOpen={openSkill} onOpenInNewTab={openInTab} />
 */
export function OverviewPage({
  hubs,
  shared,
  words,
  onOpen,
  onOpenInNewTab,
  loading = false,
  failure,
  tabs,
}: OverviewPageProps) {
  const [query, setQuery] = useState("");
  const sections = overviewSections(hubs, shared, { filter: allFilter, query });
  const headingOf = (section: OverviewSection) =>
    section.shared ? words.sharedSection(section.name) : section.name;

  function clearOnEscape(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query !== "") {
      // The field's own Escape: it must not also close the layer behind it.
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    }
  }

  return (
    <div>
      {tabs}
      {failure === undefined && (
        <div className="px-4 py-2">
          <Input
            type="search"
            aria-label={words.searchLabel}
            leadingIcon={<SearchIcon />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={clearOnEscape}
          />
        </div>
      )}
      <OverviewBody
        sections={sections}
        headingOf={headingOf}
        hasAnySection={hubs.length > 0 || (shared?.items.length ?? 0) > 0}
        query={query}
        words={words}
        loading={loading}
        failure={failure}
        onOpen={onOpen}
        onOpenInNewTab={onOpenInNewTab}
      />
    </div>
  );
}

interface OverviewBodyProps {
  readonly sections: readonly OverviewSection[];
  readonly hasAnySection: boolean;
  readonly headingOf: (section: OverviewSection) => string;
  readonly query: string;
  readonly words: OverviewWords;
  readonly loading: boolean;
  readonly failure: OverviewFailure | undefined;
  readonly onOpen: (id: string) => void;
  readonly onOpenInNewTab: (id: string) => void;
}

/** Everything under the search field (the failed state has no field): the failure, the loading rows, the states or the sections. */
function OverviewBody({
  sections,
  headingOf,
  hasAnySection,
  query,
  words,
  loading,
  failure,
  onOpen,
  onOpenInNewTab,
}: OverviewBodyProps) {
  if (failure !== undefined) {
    return (
      <EmptyState
        tone="error"
        title={failure.title}
        description={failure.reason}
        action={{ label: "Try again", onClick: failure.onTryAgain }}
      />
    );
  }
  if (loading) {
    return <List label={words.loadingLabel} rows={[]} loading loadingLabel={words.loadingLabel} />;
  }
  if (!hasAnySection) {
    return <EmptyState {...words.nothingYet} />;
  }
  if (sections.length === 0) {
    return <EmptyState plain title={words.noMatch(query.trim())} />;
  }
  return (
    <>
      {sections.map((section) => (
        <List
          key={section.id}
          heading={{ name: headingOf(section) }}
          rows={rowsOf(section)}
          empty={{ plain: true, title: words.emptySection(headingOf(section)) }}
          onOpen={onOpen}
          onOpenInNewTab={onOpenInNewTab}
        />
      ))}
    </>
  );
}
