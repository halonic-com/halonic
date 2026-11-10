import { createContext, useContext, useState } from "react";

/**
 * Which view each tab's item page shows (UX checklist 1.10, req-shell `panels.one-view-at-a-time`),
 * so a tab that comes back shows the view it was left on, even when its page wasn't kept mounted.
 * One per window, kept by `TabPages`. A view is remembered for a tab and the place it shows: the
 * same tab on another item starts on that item's first view.
 */
export class ViewMemory {
  private readonly views = new Map<string, string>();

  get(tabId: string, locationKey: string): string | undefined {
    return this.views.get(memoryKey(tabId, locationKey));
  }

  set(tabId: string, locationKey: string, view: string): void {
    this.views.set(memoryKey(tabId, locationKey), view);
  }

  /** Forgets the views of every tab not in `openTabIds`: tabs that closed. */
  keepOnly(openTabIds: readonly string[]): void {
    const open = new Set(openTabIds);
    for (const key of [...this.views.keys()]) {
      if (!open.has(tabIdOf(key))) {
        this.views.delete(key);
      }
    }
  }
}

// A tab id never holds a line break, so the first one ends it.
function memoryKey(tabId: string, locationKey: string): string {
  return `${tabId}\n${locationKey}`;
}

function tabIdOf(key: string): string {
  return key.slice(0, key.indexOf("\n"));
}

/** The tab a page is drawn in, which `TabPages` gives each page. */
export interface TabPage {
  readonly tabId: string;
  readonly locationKey: string;
  readonly views: ViewMemory;
}

export const TabPageContext = createContext<TabPage | undefined>(undefined);

/**
 * The view an item page shows, remembered for its tab: `[view, pick]`. It starts on the view the
 * tab was left on, or else `first`. Outside `TabPages` (a test, a preview) it is only kept while
 * the page is mounted.
 *
 * @example
 * const [view, pick] = useRememberedView(["flow", "configuration", "runs"], "flow");
 */
export function useRememberedView<Id extends string>(
  views: readonly Id[],
  first: Id,
): readonly [Id, (view: Id) => void] {
  const page = useContext(TabPageContext);
  const [view, setView] = useState<Id>(() => {
    const kept = page?.views.get(page.tabId, page.locationKey);
    return views.find((candidate) => candidate === kept) ?? first;
  });
  const pick = (next: Id) => {
    page?.views.set(page.tabId, page.locationKey, next);
    setView(next);
  };
  return [view, pick];
}
