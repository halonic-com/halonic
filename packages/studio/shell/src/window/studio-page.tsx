import { type ComponentType, lazy, Suspense, useMemo } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { HomePage } from "../home/home-page.tsx";
import type { PlaceContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { SearchPage } from "../search/search-page.tsx";
import { searchPageWords } from "../search/search-page-names.ts";
import type { Shell } from "../shell.ts";
import { homeLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";
import { loadView } from "../view.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

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
 * page.
 *
 * Items open once a feature adds an item kind (T6, T7); until then no tab can show one.
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
  return null;
}

function PlaceView({
  place,
  context,
}: {
  readonly place: Registered<PlaceContribution>;
  readonly context: WorkspaceContext;
}) {
  const View = usePlaceView(place);
  return (
    <Suspense fallback={null}>
      <View context={context} />
    </Suspense>
  );
}

/** The place's view, imported the first time a tab shows it; one import per place. */
function usePlaceView(place: PlaceContribution): ComponentType<PlaceViewProps> {
  return useMemo(
    () =>
      lazy(async () => ({
        default: await loadView<ComponentType<PlaceViewProps>>(place),
      })),
    [place],
  );
}
