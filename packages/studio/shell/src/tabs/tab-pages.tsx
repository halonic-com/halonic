import { type ReactNode, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { ItemGone } from "../page/item-gone.tsx";
import { PageErrorBoundary } from "../page/page-error-boundary.tsx";
import { focusPageHeading } from "./history-moves.ts";
import { mountedTabIds } from "./mounted-tabs.ts";
import {
  currentLocation,
  type TabLocation,
  type TabSet,
  type TabSetState,
  type WindowTab,
} from "./tab-set.ts";
import { WINDOW_TAB_STRIP_SELECTOR } from "./window-tab-strip.tsx";

/** Props for {@link TabPages}. */
export interface TabPagesProps {
  readonly tabs: TabSet;
  /** Draws the page for the place a tab shows. */
  readonly renderPage: (location: TabLocation, tab: WindowTab) => ReactNode;
  /**
   * Whether the item at `location` isn't in the workspace any more, and if so, what it was. Home,
   * places and items that are still there give `undefined`. Pass a new function when the
   * workspace's items change, so an open tab whose item goes away shows that it has.
   */
  readonly goneItem?: (location: TabLocation) => GoneItem | undefined;
}

/** An item a tab shows that isn't in the workspace any more. */
export interface GoneItem {
  /** Its kind, as a word in a sentence: "agent", "workflow", "run". */
  readonly kindName: string;
  /** The place that lists that kind, such as Agents, which **Go to** opens in the tab. */
  readonly place: TabLocation;
}

/** What a tab's page had when the user left it, so switching back can give it back. */
interface PageMemory {
  /** The place the page showed; a page that moved on starts afresh. */
  readonly locationKey: string;
  readonly focus?: HTMLElement;
  readonly scrollTop: number;
}

/**
 * The window tabs' pages, inside the frame's `main` (UX checklist 1.2, a11y A3 and E2). The pages
 * of the last five active tabs stay mounted, the others hidden and inert, so switching back keeps
 * their half-typed text. Each page is its own scroller.
 *
 * When the active tab changes, its page gets back its scroll and the focus it last had, or else
 * focus goes to its `h1`, as it does for a tab whose page wasn't mounted any more. While the focus
 * is in the tab strip it stays there, as in any tab list. A tab whose place changes draws a fresh
 * page.
 *
 * A page that throws while it draws stops alone, as "This page stopped working" in its own area
 * (`PageErrorBoundary`). A tab whose item isn't in the workspace any more shows `ItemGone`, whose
 * **Go to** opens the place that lists its kind in that tab.
 *
 * @example
 * <ShellFrame …>
 *   <TabPages tabs={workspace.tabs} renderPage={(location) => <PageFor location={location} />} />
 * </ShellFrame>
 */
export function TabPages({ tabs, renderPage, goneItem }: TabPagesProps) {
  const state = useSyncExternalStore(
    (listener) => tabs.subscribe(listener),
    () => tabs.state,
  );
  const mountedRef = useRef<readonly string[]>([]);
  const mounted = mountedTabIds(mountedRef.current, state);
  const pages = useRef(new Map<string, HTMLDivElement>());
  const memory = useRef(new Map<string, PageMemory>());
  const shown = useRef(shownPlace(state));

  useLayoutEffect(() => {
    mountedRef.current = mounted;
    for (const tabId of memory.current.keys()) {
      if (!mounted.includes(tabId)) {
        memory.current.delete(tabId);
      }
    }
  }, [mounted]);

  useLayoutEffect(() => {
    const before = shown.current;
    const now = shownPlace(state);
    if (now === undefined || isSamePlace(before, now)) {
      return;
    }
    shown.current = now;
    const page = pages.current.get(now.tabId);
    if (page === undefined) {
      return;
    }
    if (before?.tabId === now.tabId) {
      // The tab moved on to another place: its fresh page starts at the top. Back, Forward and the
      // sidebar move the focus themselves.
      page.scrollTop = 0;
      return;
    }
    const kept = memory.current.get(now.tabId);
    giveBack(page, kept?.locationKey === now.locationKey ? kept : undefined);
  }, [state]);

  const remember = (tab: WindowTab, change: Partial<Omit<PageMemory, "locationKey">>) => {
    const locationKey = currentLocation(tab).key;
    const kept = memory.current.get(tab.id);
    const base = kept?.locationKey === locationKey ? kept : { locationKey, scrollTop: 0 };
    memory.current.set(tab.id, { ...base, ...change });
  };

  return state.tabs
    .filter((tab) => mounted.includes(tab.id))
    .map((tab) => {
      const shown = tab.id === state.activeId;
      const location = currentLocation(tab);
      const gone = goneItem?.(location);
      return (
        // biome-ignore lint/a11y/noStaticElementInteractions: it only notes where focus and scroll are; the page's own controls are what you use
        <div
          key={tab.id}
          ref={(element) => {
            if (element === null) {
              pages.current.delete(tab.id);
            } else {
              pages.current.set(tab.id, element);
            }
          }}
          data-tab-page={tab.id}
          hidden={!shown}
          inert={!shown}
          className="h-full overflow-y-auto"
          onFocus={(event) => remember(tab, { focus: event.target })}
          onScroll={(event) => remember(tab, { scrollTop: event.currentTarget.scrollTop })}
        >
          {gone === undefined ? (
            // Keyed by the place, so a tab that moves on to another place draws a fresh page.
            <PageErrorBoundary pageKey={location.key} pageName={location.title}>
              {renderPage(location, tab)}
            </PageErrorBoundary>
          ) : (
            <ItemGone
              key={location.key}
              kindName={gone.kindName}
              place={gone.place.title}
              onGoTo={() => tabs.openHere(gone.place)}
            />
          )}
        </div>
      );
    });
}

/** The active tab and the place it shows, which the page on screen draws. */
interface ShownPlace {
  readonly tabId: string;
  readonly locationKey: string;
}

function shownPlace(state: TabSetState): ShownPlace | undefined {
  const tab = state.tabs.find((candidate) => candidate.id === state.activeId);
  return tab === undefined ? undefined : { tabId: tab.id, locationKey: currentLocation(tab).key };
}

function isSamePlace(a: ShownPlace | undefined, b: ShownPlace): boolean {
  return a?.tabId === b.tabId && a.locationKey === b.locationKey;
}

/**
 * Gives a page that was switched to back its scroll and focus from `kept`, or starts it at the top
 * with the focus on its `h1` when nothing was kept for the place it shows. The focus stays where it
 * is while it is in the tab strip.
 */
function giveBack(page: HTMLElement, kept: PageMemory | undefined) {
  page.scrollTop = kept?.scrollTop ?? 0;
  if (focusIsInTabStrip()) {
    return;
  }
  if (kept?.focus !== undefined && page.contains(kept.focus)) {
    kept.focus.focus({ preventScroll: true });
  } else {
    focusPageHeading(page);
  }
}

/**
 * Whether the focus is on a window tab, where moving through the tabs keeps it. A `tablist` on the
 * page itself doesn't count: its focus is hidden with the page, so it has to move.
 */
function focusIsInTabStrip(): boolean {
  return (document.activeElement?.closest(WINDOW_TAB_STRIP_SELECTOR) ?? null) !== null;
}
