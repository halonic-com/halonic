import {
  currentLocation,
  homeLocation,
  type TabLocation,
  type TabSet,
  type TabSetState,
} from "../tabs/tab-set.ts";

/** How many places the recent list keeps; the palette shows at most 5 of them at a time. */
export const recentPlacesKept = 50;

/**
 * The places opened lately in one workspace, the latest first, for the palette's Recent group and
 * its ranking. A place counts as opened when it becomes what the active tab shows, so going Back
 * to it counts too. Each place is listed once, and a rename on a tab renames it here as well.
 * The list lives as long as the workspace is open.
 *
 * @example
 * const recent = new RecentPlaces(workspace.tabs);
 * paletteGroups({ words, openTabs, recent: recent.list, found, searchFailed, actions });
 */
export class RecentPlaces {
  private current: readonly TabLocation[];
  private readonly listeners = new Set<() => void>();
  private readonly stopFollowing: () => void;

  constructor(tabs: TabSet) {
    this.current = [shownBy(tabs.state)];
    this.stopFollowing = tabs.subscribe(() => this.follow(tabs.state));
  }

  /** The places, the latest first. Every change makes a new list, so React can compare it. */
  get list(): readonly TabLocation[] {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stops following the tabs, when the workspace closes. */
  dispose(): void {
    this.stopFollowing();
    this.listeners.clear();
  }

  private follow(state: TabSetState): void {
    const next = renamedFrom(state, withVisit(this.current, shownBy(state)));
    if (!sameList(next, this.current)) {
      this.current = next;
      for (const listener of this.listeners) {
        listener();
      }
    }
  }
}

/** What the active tab shows. */
function shownBy(state: TabSetState): TabLocation {
  const active = state.tabs.find((tab) => tab.id === state.activeId);
  // The window always has an active tab; Home only keeps the type honest.
  return active === undefined ? homeLocation : currentLocation(active);
}

/** The list with `location` first, once, and no longer than {@link recentPlacesKept}. */
export function withVisit(
  recent: readonly TabLocation[],
  location: TabLocation,
): readonly TabLocation[] {
  if (recent[0]?.key === location.key) {
    return recent;
  }
  const others = recent.filter((place) => place.key !== location.key);
  return [location, ...others].slice(0, recentPlacesKept);
}

/** The list with each place's title as the tabs name it now, so a rename shows here too. */
function renamedFrom(state: TabSetState, recent: readonly TabLocation[]): readonly TabLocation[] {
  const titles = new Map<string, string>();
  for (const tab of state.tabs) {
    for (const place of tab.history) {
      titles.set(place.key, place.title);
    }
  }
  const renamed = recent.map((place) => {
    const title = titles.get(place.key);
    return title === undefined || title === place.title ? place : { ...place, title };
  });
  return sameList(renamed, recent) ? recent : renamed;
}

function sameList(left: readonly TabLocation[], right: readonly TabLocation[]): boolean {
  return left.length === right.length && left.every((place, index) => place === right[index]);
}
