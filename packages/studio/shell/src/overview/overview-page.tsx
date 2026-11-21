import {
  Button,
  ContextMenu,
  type ContextMenuTarget,
  EmptyState,
  FilterChips,
  Input,
  List,
  type ListRow,
  type MenuEntry,
  PlusIcon,
  SearchIcon,
  usePresentation,
} from "@halonicjs/studio-kit";
import { type KeyboardEvent, type ReactNode, type Ref, useRef, useState } from "react";
import { PhoneTopBarActions, useInPhoneTopBar } from "../phone/phone-top-bar-actions.tsx";
import {
  allFilter,
  currentFilter,
  type OverviewHub,
  type OverviewItem,
  type OverviewSection,
  type OverviewShared,
  overviewChips,
  overviewSections,
} from "./overview-model.ts";
import { useAnnounceListChange } from "./use-list-announcement.ts";

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
  /** The name of the hub filter chips: "Hub". */
  readonly chipsLabel: string;
  /** The chip that shows every hub: "All". */
  readonly allChip: string;
  /** The chip that shows only the shared items: "Shared in Acme". */
  readonly sharedChip: (workspaceName: string) => string;
  /** The ⋮ button's name, which names its row: "More actions for Sorter". */
  readonly moreLabel: (itemName: string) => string;
  /** The heading of the shared section: "Shared in Acme". */
  readonly sharedSection: (workspaceName: string) => string;
  /** A hub with no items, in its own section: "No skills in acme yet". */
  readonly emptySection: (sectionName: string) => string;
  /** Nothing matches the search: `No skills match "sorter".` The shell adds **Clear search**. */
  readonly noMatch: (query: string) => string;
  /** What a screen reader hears after a search or a hub change: "1 workflow.", "2 routines.". */
  readonly shownCount: (count: number) => string;
  /** No hub and nothing shared: "No skills yet", with the create button when the head is quiet. */
  readonly nothingYet: {
    readonly title: string;
    readonly description?: string;
    readonly action?: { readonly label: string; readonly onClick: () => void };
  };
}

/** The button under "No skills match …", which the shell draws itself (microcopy 1.1 and 11.1). */
const CLEAR_SEARCH = "Clear search";

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
  /**
   * The page's one create button, after the search field: "New skill". Under a phone top bar it is
   * a 48px **+** there, after Search, named with the label (UX 9.12). Without it, none shows.
   */
  readonly newButton?: { readonly label: string; readonly onClick: () => void };
  /**
   * The items of an item's ⋮ menu, in the feature's words. Without it, or with none for an item,
   * the row has no ⋮ button.
   */
  readonly itemMenu?: (item: OverviewItem) => readonly MenuEntry[];
  /** A tab list the feature draws above the search field, as the Library's four tabs. */
  readonly tabs?: ReactNode;
  /**
   * While nothing is listed, the search field, the create button and the hub chips are hidden, so
   * the empty state holds the only button (Workflows, flow-workflows 2.1).
   */
  readonly quietWhenEmpty?: boolean;
  /** The "nothing yet" or "no match" state's title, so the feature can move focus there when the last item goes. */
  readonly emptyTitleRef?: Ref<HTMLHeadingElement>;
  /**
   * Reads how many items a search or hub change left, or the no-match line
   * (`announcer.announceState`); absent in tests that don't listen.
   */
  readonly announceState?: ((key: string, text: string) => void) | undefined;
}

/** Opens an item's ⋮ menu below the button that was pressed. */
type OpenMenu = (item: OverviewItem, element: HTMLElement) => void;

/** Where a row's used-by text goes: on its right, or at the end of the line under its name. */
type UsedByPlace = "right" | "line";

/**
 * The line under an item's name: its detail, and on a phone its used-by text after a " · ", so the
 * kit doesn't move that text to the line's start as it does a chip. When the line is too long, the
 * detail is cut and the used-by text stays whole, as the kit's stacked rows keep their time
 * (HAL-13066). When even a cut detail leaves no room, the used-by text has the line alone, whole and
 * wrapping if it must, and the detail and its " · " aren't shown on that row (HAL-13648). An item that
 * asks for it gets its used-by text on a line of its own, whole and wrapping if it must (HAL-13100).
 */
function metaOf(item: OverviewItem, usedByPlace: UsedByPlace): ReactNode {
  if (usedByPlace === "right" || item.usedBy === undefined) {
    return item.detail;
  }
  if (item.detail === undefined) {
    return item.usedBy;
  }
  if (item.usedByOwnLine === true) {
    return (
      <>
        <span className="block truncate">{item.detail}</span>
        <span className="block whitespace-normal wrap-break-word">{item.usedBy}</span>
      </>
    );
  }
  return <DetailThenUsedBy detail={item.detail} usedBy={item.usedBy} />;
}

/**
 * A phone row's "detail · used-by" line. It is a wrapping flex line in which the detail and its dot
 * ask for 5rem, or their own width when that is less; when the used-by text leaves less, the detail
 * wraps onto a line of its own.
 * `flex-wrap-reverse` puts that line below the used-by text, and the detail's box is 0px high, so
 * the line is 0px high too and `overflow-hidden` clips it: the row shows the used-by text alone,
 * never a stray " · ". The text stays in the DOM in reading order, so a screen reader still hears
 * the whole line.
 */
function DetailThenUsedBy({
  detail,
  usedBy,
}: {
  readonly detail: string;
  readonly usedBy: ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-wrap-reverse overflow-hidden">
      {/* In a reversed wrap `self-end` is the line's top, so the 0px box's text hangs into the line.
          The 5rem is the box's basis, not its minimum: `max-w-fit` then caps a short detail at its
          own width, so its dot sits right before the used-by text (a minimum would win over the cap
          and leave a gap). A long detail still needs 5rem before it wraps away. */}
      <span className="flex h-0 min-w-0 max-w-fit flex-[1_1_5rem] self-end">
        {/* `h-lh`: stretched to the 0px box, `truncate`'s overflow would clip the detail to nothing. */}
        <span className="h-lh min-w-0 truncate">{detail}</span>
        {/* `whitespace-pre` keeps the spaces round the dot: a flex item would drop them. */}
        <span className="shrink-0 whitespace-pre"> · </span>
      </span>
      <span className="min-w-0 whitespace-normal wrap-break-word">{usedBy}</span>
    </span>
  );
}

/** The row's right side: its chips, then its used-by text when that goes there. */
function trailingOf(item: OverviewItem, usedByPlace: UsedByPlace): ReactNode {
  const usedBy = usedByPlace === "right" ? item.usedBy : undefined;
  if (item.chips === undefined && usedBy === undefined) {
    return undefined;
  }
  return (
    <span className="flex items-center gap-2">
      {item.chips}
      {usedBy === undefined ? null : <span className="text-small text-fg-muted">{usedBy}</span>}
    </span>
  );
}

function rowsOf(
  section: OverviewSection,
  words: OverviewWords,
  menuOf: ((item: OverviewItem) => readonly MenuEntry[]) | undefined,
  openMenu: OpenMenu,
  usedByPlace: UsedByPlace,
): readonly ListRow[] {
  return section.items.map((item) => {
    const meta = metaOf(item, usedByPlace);
    const trailing = trailingOf(item, usedByPlace);
    return {
      id: item.id,
      title: item.name,
      ...(meta === undefined ? {} : { meta }),
      ...(item.avatar === undefined ? {} : { avatar: item.avatar }),
      ...(trailing === undefined ? {} : { trailing }),
      ...(menuOf === undefined || menuOf(item).length === 0
        ? {}
        : {
            more: {
              label: words.moreLabel(item.name),
              onClick: (event) => openMenu(item, event.currentTarget),
            },
          }),
    };
  });
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
  newButton,
  itemMenu,
  tabs,
  quietWhenEmpty = false,
  emptyTitleRef,
  announceState,
}: OverviewPageProps) {
  const phone = usePresentation() === "phone";
  const inTopBar = useInPhoneTopBar();
  const [query, setQuery] = useState("");
  const searchField = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState(allFilter);
  const [menu, setMenu] = useState<{ item: OverviewItem; target: ContextMenuTarget }>();
  const chips = overviewChips(hubs, shared, { all: words.allChip, shared: words.sharedChip });
  const filter = currentFilter(chosen, chips);
  const sections = overviewSections(hubs, shared, { filter, query });
  const nothingListed =
    !hubs.some((hub) => hub.items.length > 0) && (shared?.items.length ?? 0) === 0;
  const showHead = failure === undefined && !(quietWhenEmpty && !loading && nothingListed);
  const headingOf = (section: OverviewSection) =>
    section.shared ? words.sharedSection(section.name) : section.name;
  const hasAnySection = quietWhenEmpty ? !nothingListed : hasSection(hubs, shared);
  // Only a list the search field is over is read: not the loading rows, a failure or "nothing yet".
  useAnnounceListChange(
    JSON.stringify([query.trim(), filter]),
    showHead && !loading && hasAnySection ? shownText(sections, query, words) : undefined,
    announceState,
  );

  function clearOnEscape(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query !== "") {
      // The field's own Escape: it must not also close the layer behind it.
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    }
  }

  function clearSearch() {
    setQuery("");
    searchField.current?.focus();
  }

  return (
    <div>
      {tabs}
      {showHead && (
        <>
          {/* On a phone the search field has the whole line, so its placeholder isn't cut, and the create button is 48px. */}
          <div className={`flex gap-2 px-4 py-2 ${phone ? "flex-col" : "items-center"}`}>
            <div className="min-w-0 flex-1">
              <Input
                ref={searchField}
                type="search"
                aria-label={words.searchLabel}
                placeholder={words.searchLabel}
                leadingIcon={<SearchIcon />}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={clearOnEscape}
              />
            </div>
            {newButton && inTopBar && (
              <PhoneTopBarActions>
                <Button
                  variant="ghost"
                  size="lg"
                  icon={<PlusIcon />}
                  label={newButton.label}
                  onClick={newButton.onClick}
                />
              </PhoneTopBarActions>
            )}
            {newButton && !inTopBar && (
              <Button
                variant="primary"
                icon={<PlusIcon />}
                onClick={newButton.onClick}
                {...(phone ? { size: "touch", block: true } : {})}
              >
                {newButton.label}
              </Button>
            )}
          </div>
          {chips.length > 2 && (
            <FilterChips
              label={words.chipsLabel}
              options={chips}
              value={filter}
              onChange={setChosen}
            />
          )}
        </>
      )}
      <OverviewBody
        sections={sections}
        headingOf={headingOf}
        hasAnySection={hasAnySection}
        query={query}
        onClearSearch={clearSearch}
        words={words}
        emptyTitleRef={emptyTitleRef}
        loading={loading}
        failure={failure}
        onOpen={onOpen}
        onOpenInNewTab={onOpenInNewTab}
        itemMenu={itemMenu}
        openMenu={(item, element) => setMenu({ item, target: { element } })}
      />
      {menu !== undefined && itemMenu !== undefined && (
        <ContextMenu
          label={words.moreLabel(menu.item.name)}
          entries={itemMenu(menu.item)}
          target={menu.target}
          onClose={() => setMenu(undefined)}
        />
      )}
    </div>
  );
}

/** Whether there is a section to draw, even an empty one: a hub, or something shared. */
function hasSection(hubs: readonly OverviewHub[], shared: OverviewShared | undefined): boolean {
  return hubs.length > 0 || (shared?.items.length ?? 0) > 0;
}

/** What the list shows, in words: how many items, or the no-match line when none. */
function shownText(
  sections: readonly OverviewSection[],
  query: string,
  words: OverviewWords,
): string {
  if (sections.length === 0) {
    return words.noMatch(query.trim());
  }
  const count = sections.reduce((total, section) => total + section.items.length, 0);
  return words.shownCount(count);
}

interface OverviewBodyProps {
  readonly sections: readonly OverviewSection[];
  readonly hasAnySection: boolean;
  readonly headingOf: (section: OverviewSection) => string;
  readonly query: string;
  readonly onClearSearch: () => void;
  readonly words: OverviewWords;
  readonly emptyTitleRef: Ref<HTMLHeadingElement> | undefined;
  readonly loading: boolean;
  readonly failure: OverviewFailure | undefined;
  readonly onOpen: (id: string) => void;
  readonly onOpenInNewTab: (id: string) => void;
  readonly itemMenu: OverviewPageProps["itemMenu"];
  readonly openMenu: OpenMenu;
}

/** Everything under the search field (the failed state has no field): the failure, the loading rows, the states or the sections. */
function OverviewBody({
  sections,
  headingOf,
  hasAnySection,
  query,
  onClearSearch,
  words,
  emptyTitleRef,
  loading,
  failure,
  onOpen,
  onOpenInNewTab,
  itemMenu,
  openMenu,
}: OverviewBodyProps) {
  const usedByPlace: UsedByPlace = usePresentation() === "phone" ? "line" : "right";
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
    return (
      <EmptyState
        {...words.nothingYet}
        {...(emptyTitleRef === undefined ? {} : { titleRef: emptyTitleRef })}
      />
    );
  }
  if (sections.length === 0) {
    return (
      <EmptyState
        plain
        title={words.noMatch(query.trim())}
        {...(emptyTitleRef === undefined ? {} : { titleRef: emptyTitleRef })}
        action={{ label: CLEAR_SEARCH, onClick: onClearSearch }}
      />
    );
  }
  // Each section is its own box with its heading above it, as Home draws its sections. 8px between
  // them, and the heading's own 16px top padding makes 24px from one box to the next heading.
  return (
    <div className="flex flex-col gap-2">
      {sections.map((section) => {
        const rows = rowsOf(section, words, itemMenu, openMenu, usedByPlace);
        const name = headingOf(section);
        return rows.length === 0 ? (
          <List
            key={section.id}
            heading={{ name }}
            rows={rows}
            empty={{ plain: true, title: words.emptySection(name) }}
            onOpen={onOpen}
            onOpenInNewTab={onOpenInNewTab}
          />
        ) : (
          <List
            key={section.id}
            label={name}
            groups={[{ id: section.id, heading: { name }, rows }]}
            groupHeadingLevel={2}
            onOpen={onOpen}
            onOpenInNewTab={onOpenInNewTab}
          />
        );
      })}
    </div>
  );
}
