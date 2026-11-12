import { Suspense } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { HomePage } from "../home/home-page.tsx";
import { lazyView } from "../lazy-view.ts";
import type { PlaceContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { SearchPage } from "../search/search-page.tsx";
import { searchPageWords } from "../search/search-page-names.ts";
import type { Shell } from "../shell.ts";
import { homeLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { ItemView, itemOfLocationKey } from "./item-view.tsx";

/** What a place's view gets: the context of the feature that added the place. */
export interface PlaceViewProps {
  readonly context: WorkspaceContext;
}

/** Props for {@link StudioPage}. */
export interface StudioPageProps {
  /** The place the tab shows. */
  readonly location: TabLocation;
  readonly shell: Shell;
  readonly tabs: TabSet;
  readonly announcer: Announcer;
  readonly contextFor: (featureId: string) => WorkspaceContext;
}

/**
 * The page for a tab's place (`shell.studio-window`): Home with the cards features added, a
 * Search page for "Search: <words>", or the view of a place a feature added. The view is imported
 * the first time a tab shows the place, and nothing stands in for it while it loads. A view that
 * fails to load is "This page stopped working", from the `PageErrorBoundary` round every tab's
 * page and round the phone's page.
 *
 * A tab on an item (`kind/hub/id`) shows the `open` view of the kind a feature added
 * (`shell.item-tabs`), given the item and that feature's context, imported the first time a tab
 * shows the kind. An item of a kind no feature added shows nothing.
 */
export function StudioPage({ location, shell, tabs, announcer, contextFor }: StudioPageProps) {
  const { contributions } = shell;
  if (location.key === homeLocation.key) {
    return <HomePage cards={contributions.home.cards()} contextFor={contextFor} />;
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
  const place = contributions.places.list().find((added) => added.id === location.key);
  if (place !== undefined) {
    return <PlaceView place={place} context={contextFor(place.featureId)} />;
  }
  const item = itemOfLocationKey(location.key);
  const kind = item === undefined ? undefined : contributions.itemKinds.get(item.kind);
  if (item !== undefined && kind !== undefined) {
    return <ItemView kind={kind} item={item} context={contextFor(kind.featureId)} />;
  }
  return null;
}

function PlaceView({
  place,
  context,
}: {
  readonly place: Registered<PlaceContribution>;
  readonly context: WorkspaceContext;
}) {
  const View = lazyView<PlaceViewProps>(place);
  return (
    <Suspense fallback={null}>
      <View context={context} />
    </Suspense>
  );
}
