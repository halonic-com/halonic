import { type ReactNode, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { focusPageHeading } from "./history-moves.ts";
import { mountedTabIds } from "./mounted-tabs.ts";
import { currentLocation, type TabLocation, type TabSet, type WindowTab } from "./tab-set.ts";

/** Props for {@link TabPages}. */
export interface TabPagesProps {
  readonly tabs: TabSet;
  /** Draws the page for the place a tab shows. */
  readonly renderPage: (location: TabLocation, tab: WindowTab) => ReactNode;
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
 * @example
 * <ShellFrame …>
 *   <TabPages tabs={workspace.tabs} renderPage={(location) => <PageFor location={location} />} />
 * </ShellFrame>
 */
export function TabPages({ tabs, renderPage }: TabPagesProps) {
  const state = useSyncExternalStore(
    (listener) => tabs.subscribe(listener),
    () => tabs.state,
  );
  const mountedRef = useRef<readonly string[]>([]);
  const mounted = mountedTabIds(mountedRef.current, state);
  const pages = useRef(new Map<string, HTMLDivElement>());
  const memory = useRef(new Map<string, PageMemory>());
  const shownId = useRef(state.activeId);

  useLayoutEffect(() => {
    mountedRef.current = mounted;
    for (const tabId of memory.current.keys()) {
      if (!mounted.includes(tabId)) {
        memory.current.delete(tabId);
      }
    }
  }, [mounted]);

  useLayoutEffect(() => {
    if (shownId.current === state.activeId) {
      return;
    }
    shownId.current = state.activeId;
    const page = pages.current.get(state.activeId);
    const tab = state.tabs.find((candidate) => candidate.id === state.activeId);
    if (page === undefined || tab === undefined) {
      return;
    }
    const kept = memory.current.get(tab.id);
    const same = kept?.locationKey === currentLocation(tab).key;
    page.scrollTop = same ? kept.scrollTop : 0;
    if (focusIsInTabStrip()) {
      return;
    }
    if (same && kept.focus !== undefined && page.contains(kept.focus)) {
      kept.focus.focus({ preventScroll: true });
    } else {
      focusPageHeading(page);
    }
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
          <PageContent key={location.key}>{renderPage(location, tab)}</PageContent>
        </div>
      );
    });
}

/** Keyed by the place, so a tab that moves on to another place draws a fresh page. */
function PageContent({ children }: { readonly children: ReactNode }) {
  return children;
}

/** Whether the focus is on a window tab, where moving through the tabs keeps it. */
function focusIsInTabStrip(): boolean {
  return (document.activeElement?.closest('[role="tablist"]') ?? null) !== null;
}
