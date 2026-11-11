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
 * to it counts too. Each place is listed once, and `TabSet.rename` renames it here as well, even
 * when its tab was closed. The list lives as long as the workspace is open.
 *
 * @example
 * const recent = new RecentPlaces(workspace.tabs);
 * paletteGroups({ words, openTabs, recent: recent.list, found, searchFailed, actions });
 */
export class RecentPlaces {
  private current: readonly TabLocation[];
  private readonly listeners = new Set<() => void>();
  private readonly stopFollowing: (() => void)[];

  constructor(tabs: TabSet) {
    this.current = [shownBy(tabs.state)];
    this.stopFollowing = [
      tabs.subscribe(() => this.change(withVisit(this.current, shownBy(tabs.state)))),
      tabs.subscribeToRenames((key, title) => this.change(renamed(this.current, key, title))),
    ];
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
    for (const stop of this.stopFollowing) {
      stop();
    }
    this.listeners.clear();
  }

  /** Keeps `next` and tells the listeners, when it isn't the list already kept. */
  private change(next: readonly TabLocation[]): void {
    if (next !== this.current) {
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

/** The list with the place `key` titled `title`; the same list when nothing changes. */
function renamed(
  recent: readonly TabLocation[],
  key: string,
  title: string,
): readonly TabLocation[] {
  if (!recent.some((place) => place.key === key && place.title !== title)) {
    return recent;
  }
  return recent.map((place) => (place.key === key ? { ...place, title } : place));
}
