import { useNarrow, usePresentation } from "@halonicjs/studio-kit";
import type { Announcer } from "../announcer/announcer.ts";
import { HomePage } from "../home/home-page.tsx";
import { HomeView } from "../home/home-view.tsx";
import { BackLinkSlotProvider } from "../page/back-link-slot.tsx";
import { PageBackLink } from "../page/page-back-link.tsx";
import type { PhonePageMemory } from "../phone/page-memory.tsx";
import { type PlaceContribution, type PlaceSlotProps, placeNames } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { SearchPage } from "../search/search-page.tsx";
import { searchPageWords } from "../search/search-page-names.ts";
import type { Shell } from "../shell.ts";
import { homeLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { ItemView, itemOfLocationKey } from "./item-view.tsx";
import { phonePagesTab, usePlaceOpenItem } from "./place-open-items.ts";

/** What a place's view gets: the context of the feature that added the place. */
export interface PlaceViewProps {
  readonly context: WorkspaceContext;
  /**
   * The sub-page a phone pushed above the place's list (`openPlaceList`), the part of the page's
   * key after `place/`, such as `skill` for `library/skill`. It is `undefined` on the place's own
   * page, and always on the desktop, which has no such pages.
   */
  readonly sub?: string;
  /**
   * On a phone, what this page keeps while pages pushed above it are open (`openPlacePage`), as
   * the phone draws the page fresh when Back returns to it. `undefined` on the desktop, whose tab
   * keeps the view drawn.
   */
  readonly memory?: PhonePageMemory;
}

/**
 * What the page of a place with its own list column gets (`shell.rail-frame`): the place's props,
 * the open item the shell keeps for the tab, and whether the window draws the list. While it
 * doesn't, under 900px or on a phone, the page draws the feature's own list view, with the same
 * props, one pane at a time.
 */
export interface PlaceListPageProps extends PlaceViewProps, PlaceSlotProps {
  /** Whether the window's list column shows the place's list, so the page leaves it out. */
  readonly listInFrame: boolean;
}

/** Props for {@link StudioPage}. */
export interface StudioPageProps {
  /** The place the tab shows. */
  readonly location: TabLocation;
  readonly shell: Shell;
  readonly tabs: TabSet;
  readonly announcer: Announcer;
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /** Shows an item's back link above its page, as the desktop does; the phone has its own Back. */
  readonly backLink?: boolean;
  /** The phone page's memory, handed to a place's view (`PlaceViewProps`). */
  readonly memory?: PhonePageMemory | undefined;
  /** The tab that shows the page, whose open item a place's page gets; the phone's pages have none. */
  readonly tabId?: string | undefined;
}

/**
 * The page for a tab's place (`shell.studio-window`): Home with the cards features added, a
 * Search page for "Search: <words>", or the view of a place a feature added. The view is imported
 * the first time a tab shows the place, with "Loading _page_" while it loads
 * (`shell.view-loading-state`). A view that fails to load is "This page stopped working", from the
 * `PageErrorBoundary` round every tab's page and round the phone's page, whose **Reload page**
 * imports it again.
 *
 * A tab on an item (`kind/hub/id`) shows the `open` view of the kind a feature added
 * (`shell.item-tabs`), given the item and that feature's context, imported the first time a tab
 * shows the kind. An item of a kind no feature added shows nothing. With `backLink`, an item
 * whose kind names its `place` gets a "← Workflows" link, which its `ItemPage` draws above the
 * header (`shell.page-back-link`).
 */
export function StudioPage({
  location,
  shell,
  tabs,
  announcer,
  contextFor,
  backLink = false,
  memory,
  tabId = phonePagesTab,
}: StudioPageProps) {
  const { contributions } = shell;
  if (location.key === homeLocation.key) {
    const sections = <HomePage cards={contributions.home.cards()} contextFor={contextFor} />;
    const view = contributions.home.view();
    if (view === undefined) {
      return sections;
    }
    return (
      <HomeView
        view={view}
        context={contextFor(view.featureId)}
        sections={sections}
        name={location.title}
      />
    );
  }
  const words = searchPageWords(location);
  if (words !== undefined) {
    return (
      <SearchPage
        words={words}
        tabs={tabs}
        announcer={announcer}
        providers={contributions.search.providers()}
        contextFor={contextFor}
        kinds={contributions.itemKinds}
        notAnswering={shell.engine.words.notAnswering}
      />
    );
  }
  const place = contributions.places.list().find((added) => {
    const rest = location.key.slice(added.id.length + 1);
    return (
      location.key === added.id || (location.key.startsWith(`${added.id}/`) && !rest.includes("/"))
    );
  });
  if (place !== undefined) {
    const sub = location.key.slice(place.id.length + 1);
    return (
      <PlaceView
        place={place}
        name={location.title}
        context={contextFor(place.featureId)}
        {...(sub === "" ? {} : { sub })}
        memory={memory}
        tabs={tabs}
        tabId={tabId}
      />
    );
  }
  const item = itemOfLocationKey(location.key);
  const kind = item === undefined ? undefined : contributions.itemKinds.get(item.kind);
  if (item !== undefined && kind !== undefined) {
    const view = (
      <ItemView
        kind={kind}
        name={location.title}
        item={item}
        context={contextFor(kind.featureId)}
        sections={contributions.itemPage.sectionsFor(kind.kind)}
        contextFor={contextFor}
        step={location.step}
        asked={location.asked}
      />
    );
    if (!backLink || kind.place === undefined) {
      return view;
    }
    const parent = { key: kind.place, title: placeNames[kind.place].label };
    return (
      <BackLinkSlotProvider
        value={<PageBackLink parent={parent} tabs={tabs} announcer={announcer} />}
      >
        {view}
      </BackLinkSlotProvider>
    );
  }
  return null;
}

/**
 * A place's page. Every place's view gets the open item the shell keeps for its tab and
 * `listInFrame`, which only a place with a list column reads (`PlaceListPageProps`). The window
 * draws that list from 900px on the desktop, where the frame draws the list column.
 */
function PlaceView({
  place,
  name,
  context,
  sub,
  memory,
  tabs,
  tabId,
}: {
  readonly place: Registered<PlaceContribution>;
  readonly name: string;
  readonly context: WorkspaceContext;
  readonly sub?: string;
  readonly memory: PhonePageMemory | undefined;
  readonly tabs: TabSet;
  readonly tabId: string;
}) {
  const { open, setOpen } = usePlaceOpenItem(tabs, tabId, place.id);
  const wide = usePresentation() === "desktop" && !useNarrow();
  return (
    <LoadedView<PlaceListPageProps>
      view={place}
      name={name}
      props={{
        context,
        open,
        setOpen,
        listInFrame: wide && place.listColumn !== undefined,
        ...(sub === undefined ? {} : { sub }),
        ...(memory === undefined ? {} : { memory }),
      }}
    />
  );
}
