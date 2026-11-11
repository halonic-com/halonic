import {
  Button,
  CloseIcon,
  EmptyState,
  FilterChips,
  Input,
  SearchIcon,
  SkeletonBar,
} from "@halonicjs/studio-kit";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { MarkedText } from "../palette/marked-text.tsx";
import { itemLocation } from "../palette/palette-groups.ts";
import type { PaletteKindNames } from "../palette/palette-options.ts";
import { usePaletteSearch } from "../palette/use-palette-search.ts";
import type { SearchProviderContribution } from "../points/commands.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import type { Registered } from "../points/point-store.ts";
import { LocationLink } from "../tabs/location-link.tsx";
import { openLocation } from "../tabs/open-location.ts";
import type { TabLocation, TabSet } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import {
  type NameResult,
  type SearchPageNames,
  type SearchScope,
  searchPageCount,
  searchPageLocation,
  searchPageNames,
} from "./search-page-names.ts";
import { usePausedWords } from "./use-paused-words.ts";

/** Props for {@link SearchPage}. */
export interface SearchPageProps {
  /** The place's words, which the box starts with: `searchPageWords(location)`. */
  readonly words: string;
  /** The open workspace's tabs: new words open here, a result here or in a new tab. */
  readonly tabs: TabSet;
  /** Says "Opened *Refund checker* in a new tab." */
  readonly announcer: Announcer;
  /** `shell.contributions.search.providers()`. */
  readonly providers: readonly Registered<SearchProviderContribution>[];
  /** A feature's context in the workspace: `(featureId) => shell.services.contextFor(featureId, target)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /** `shell.contributions.itemKinds`, for the In chip's words and the tab of an opened item. */
  readonly kinds: PaletteKindNames;
  /** Why it couldn't search: `shell.engine.words.notAnswering`. */
  readonly notAnswering: string;
  /** A result's 16px icon, by its kind. */
  readonly iconFor?: ((item: ItemRef) => ReactNode) | undefined;
}

/**
 * The Search page (VK T2-F7, F26; microcopy 3.5): the `h1` "Search", its sentence, the search box,
 * the In and Hub picker chips with Match case and Whole word, and the "Names and descriptions"
 * section worked out by `searchPageNames`. There is no "Text inside" section and no Pattern chip
 * until the engine searches the text of files, so the page never shows a control with nothing
 * behind it.
 *
 * The results follow the box as the user types, once the typing pauses, without a new place.
 * Enter commits the typed words as a new place in this tab, so the tab's title names them and
 * Back goes to the words committed before; the chips start again from their defaults there.
 * Words typed but not committed stay with this page only: the place keeps its own words. A result
 * opens here, or with a Ctrl-click, Cmd-click or middle-click in a new tab.
 *
 * Mount it fresh for each place: the box and the chips start from `words` and their defaults only
 * on mount, and a new `words` doesn't reset them. `TabPages` does this by keying each page with
 * its `location.key`.
 *
 * @example
 * <SearchPage words={searchPageWords(location) ?? ""} tabs={workspace.tabs} announcer={shell.announcer}
 *   providers={shell.contributions.search.providers()} contextFor={contextFor}
 *   kinds={shell.contributions.itemKinds} notAnswering={shell.engine.words.notAnswering} />
 */
export function SearchPage(props: SearchPageProps) {
  const { words, tabs, announcer, kinds } = props;
  const [typed, setTyped] = useState(words);
  const searched = usePausedWords(typed);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [scope, setScope] = useState<SearchScope>({});
  const box = useRef<HTMLInputElement>(null);
  const search = usePaletteSearch(searched, props.providers, props.contextFor);
  const names = searchPageNames(
    { words: searched, options: { matchCase, wholeWord }, scope },
    search.found.results,
    search.found.failed,
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typed.trim() !== "" && typed.trim() !== words.trim()) {
      tabs.openHere(searchPageLocation(typed));
    }
  };
  const clear = () => {
    setTyped("");
    box.current?.focus();
  };
  const searchAllHubs = () => {
    setScope(({ kind }) => (kind === undefined ? {} : { kind }));
    // The button goes with the empty state, so focus goes back to the box.
    box.current?.focus();
  };
  const open = (location: TabLocation, inNewTab: boolean) =>
    openLocation(tabs, announcer, location, inNewTab);

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-6 py-6">
      <div className="flex flex-col gap-1">
        <h1 tabIndex={-1} className="text-title outline-none">
          Search
        </h1>
        <p className="text-body text-fg-muted">{pageSentence}</p>
      </div>
      {/* The role keeps the landmark where WebKitGTK (Tauri on Linux) predates `<search>`. */}
      {/* biome-ignore lint/a11y/noRedundantRoles: older engines don't map `<search>` yet. */}
      <search role="search">
        <form onSubmit={onSubmit}>
          <Input
            ref={box}
            aria-label="Search words"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            leadingIcon={<SearchIcon />}
            trailing={
              typed === "" ? undefined : (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<CloseIcon />}
                  label="Clear"
                  onClick={clear}
                />
              )
            }
          />
        </form>
      </search>
      <FilterChips
        label="Narrow the results"
        pickers={[
          {
            label: "In",
            all: "Everything",
            options: names.kinds.map((kind) => ({
              value: kind,
              label: kinds.get(kind)?.label ?? kind,
            })),
            value: scope.kind,
            onChange: (kind) => setScope(({ hub }) => withScope(kind, hub)),
          },
          {
            label: "Hub",
            all: "All hubs",
            options: names.hubs.map((hub) => ({ value: hub, label: hub })),
            value: scope.hub,
            onChange: (hub) => setScope(({ kind }) => withScope(kind, hub)),
          },
        ]}
        toggles={[
          { label: "Match case", pressed: matchCase, onChange: setMatchCase },
          { label: "Whole word", pressed: wholeWord, onChange: setWholeWord },
        ]}
      />
      <SearchResults
        words={searched}
        names={names}
        searching={search.searching}
        notAnswering={props.notAnswering}
        onTryAgain={search.tryAgain}
        onSearchAllHubs={searchAllHubs}
        renderResult={(result) => (
          <ResultRow
            result={result}
            location={itemLocation(result.item, result.label, kinds)}
            icon={props.iconFor?.(result.item)}
            onOpen={open}
          />
        )}
      />
    </div>
  );
}

/**
 * Under the title (microcopy 3.5, revision 37, trimmed to what it searches today): it says
 * "or by the words inside it" once the engine searches the text of files.
 */
const pageSentence = "Find anything in this workspace by its name or description.";

/** Why nothing matched, trimmed the same way as {@link pageSentence}. */
const nothingFoundSentence =
  "Search looks in the names and descriptions of everything in this workspace.";

function withScope(kind: string | undefined, hub: string | undefined): SearchScope {
  return {
    ...(kind === undefined ? {} : { kind }),
    ...(hub === undefined ? {} : { hub }),
  };
}

interface SearchResultsProps {
  readonly words: string;
  readonly names: SearchPageNames;
  readonly searching: boolean;
  readonly notAnswering: string;
  readonly onTryAgain: () => void;
  readonly onSearchAllHubs: () => void;
  readonly renderResult: (result: NameResult) => ReactNode;
}

/**
 * What the words found, or the state that stands in for it: "Searching…" over the rows kept from
 * the earlier words, marked busy, or over still skeleton rows, "Couldn't search" with the reason
 * and **Try again**, or "Nothing matches" with **Search all hubs** while a hub is picked. The line above them is a status, so a screen reader hears the
 * count, or what stands in for it, once the search is done; with nothing typed there is nothing
 * to say.
 */
function SearchResults(props: SearchResultsProps) {
  const headingId = useId();
  const state = searchedState(props);
  return (
    <>
      <p role="status" className="text-small text-fg-muted">
        {statusLine(props)}
      </p>
      {state !== undefined ? (
        state
      ) : (
        <section aria-labelledby={headingId} className="flex flex-col gap-2">
          <h2 id={headingId} className={groupLabelClasses}>
            Names and descriptions
          </h2>
          <ul
            aria-busy={props.searching}
            className="overflow-hidden rounded-md border border-border"
          >
            {props.names.results.map((result) => (
              <li key={result.key} className="border-border not-last:border-b">
                {props.renderResult(result)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * What the status line says: "Searching…", then the count, or the title of the state that stands
 * in for the results, so a screen reader doesn't hear the search end in silence.
 */
function statusLine({ words, names, searching }: SearchResultsProps): string {
  if (words.trim() === "") {
    return "";
  }
  if (searching) {
    return "Searching…";
  }
  if (names.couldNotSearch) {
    return couldNotSearchTitle;
  }
  if (names.nothingFound) {
    return nothingMatchesTitle(words);
  }
  return searchPageCount(names);
}

const couldNotSearchTitle = "Couldn't search";

function nothingMatchesTitle(words: string): string {
  return `Nothing matches “${words.trim()}”`;
}

/**
 * The state that takes the results' place: nothing while nothing is typed, or `undefined` when
 * there are results to list. While new words are searched, the rows found for the earlier words
 * that the new words still match stay listed, as in the palette, so the list doesn't flash and
 * jump at every pause in the typing; the skeleton rows show only when there are none to keep.
 */
function searchedState(props: SearchResultsProps): ReactNode {
  const { words, names } = props;
  if (words.trim() === "") {
    return null;
  }
  if (props.searching) {
    return names.results.length === 0 ? <SearchingRows /> : undefined;
  }
  if (names.couldNotSearch) {
    return (
      <EmptyState
        tone="error"
        plain
        title={couldNotSearchTitle}
        description={props.notAnswering}
        action={{ label: "Try again", onClick: props.onTryAgain }}
      />
    );
  }
  if (names.nothingFound) {
    return (
      <EmptyState
        plain
        title={nothingMatchesTitle(words)}
        description={nothingFoundSentence}
        {...(names.offerAllHubs
          ? { secondaryAction: { label: "Search all hubs", onClick: props.onSearchAllHubs } }
          : {})}
      />
    );
  }
  return undefined;
}

// Small caps over a group, as the item page's kind label (VK T2-F7).
const groupLabelClasses = "px-4 text-caption uppercase tracking-label text-fg-subtle";

interface ResultRowProps {
  readonly result: NameResult;
  readonly location: TabLocation;
  readonly icon: ReactNode;
  readonly onOpen: (location: TabLocation, inNewTab: boolean) => void;
}

/**
 * One item found: its icon, its name with the words marked and its kind and hub after it, then
 * its description with the words marked (VK T2-F7). The whole row is the link that opens it.
 */
function ResultRow({ result, location, icon, onOpen }: ResultRowProps) {
  return (
    <LocationLink location={location} onOpen={onOpen} className={rowClasses}>
      <span aria-hidden="true" className="mt-0.5 size-icon-sm shrink-0 text-fg-muted *:size-full">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-body text-fg">
            <MarkedText text={result.label} found={result.labelMatch} />
          </span>
          {result.detail === undefined ? null : (
            <span className="shrink-0 text-small text-fg-subtle">{result.detail}</span>
          )}
        </span>
        {result.description === undefined ? null : (
          <span className="truncate text-small text-fg-muted">
            <MarkedText text={result.description} found={result.descriptionMatch} />
          </span>
        )}
      </span>
    </LocationLink>
  );
}

const rowClasses = [
  "flex min-h-14 items-start gap-3 px-4 py-2.5 text-fg no-underline outline-none",
  "hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-ring-inset",
].join(" ");

/** Still skeleton rows while the providers look, no spinner (microcopy 3.5, kit 19.3). */
function SearchingRows() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-md border border-border">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex h-14 items-center gap-3 px-4">
          <SkeletonBar kind="icon" />
          <span className="flex w-64 flex-col gap-1.5">
            <SkeletonBar kind="title" />
            <SkeletonBar kind="meta" />
          </span>
        </div>
      ))}
    </div>
  );
}
