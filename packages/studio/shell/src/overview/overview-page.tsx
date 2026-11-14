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
} from "@halonicjs/studio-kit";
import { type KeyboardEvent, type ReactNode, useState } from "react";
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
  /** The page's one create button, after the search field: "New skill". Without it, none shows. */
  readonly newButton?: { readonly label: string; readonly onClick: () => void };
  /**
   * The items of an item's ⋮ menu, in the feature's words. Without it, or with none for an item,
   * the row has no ⋮ button.
   */
  readonly itemMenu?: (item: OverviewItem) => readonly MenuEntry[];
  /** A tab list the feature draws above the search field, as the Library's four tabs. */
  readonly tabs?: ReactNode;
}

/** Opens an item's ⋮ menu below the button that was pressed. */
type OpenMenu = (item: OverviewItem, element: HTMLElement) => void;

function rowsOf(
  section: OverviewSection,
  words: OverviewWords,
  menuOf: ((item: OverviewItem) => readonly MenuEntry[]) | undefined,
  openMenu: OpenMenu,
): readonly ListRow[] {
  return section.items.map((item) => ({
    id: item.id,
    title: item.name,
    ...(item.detail === undefined ? {} : { meta: item.detail }),
    ...(item.usedBy === undefined
      ? {}
      : { trailing: <span className="text-small text-fg-muted">{item.usedBy}</span> }),
    ...(menuOf === undefined || menuOf(item).length === 0
      ? {}
      : {
          more: {
            label: words.moreLabel(item.name),
            onClick: (event) => openMenu(item, event.currentTarget),
          },
        }),
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
  newButton,
  itemMenu,
  tabs,
}: OverviewPageProps) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(allFilter);
  const [menu, setMenu] = useState<{ item: OverviewItem; target: ContextMenuTarget }>();
  const chips = overviewChips(hubs, shared, { all: words.allChip, shared: words.sharedChip });
  const filter = currentFilter(chosen, chips);
  const sections = overviewSections(hubs, shared, { filter, query });
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
        <>
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="min-w-0 flex-1">
              <Input
                type="search"
                aria-label={words.searchLabel}
                leadingIcon={<SearchIcon />}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={clearOnEscape}
              />
            </div>
            {newButton && (
              <Button variant="primary" icon={<PlusIcon />} onClick={newButton.onClick}>
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
        hasAnySection={hubs.length > 0 || (shared?.items.length ?? 0) > 0}
        query={query}
        words={words}
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
  readonly itemMenu: OverviewPageProps["itemMenu"];
  readonly openMenu: OpenMenu;
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
  itemMenu,
  openMenu,
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
          rows={rowsOf(section, words, itemMenu, openMenu)}
          empty={{ plain: true, title: words.emptySection(headingOf(section)) }}
          onOpen={onOpen}
          onOpenInNewTab={onOpenInNewTab}
        />
      ))}
    </>
  );
}
