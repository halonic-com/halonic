import { useEffect, useRef } from "react";

/**
 * Reads what an overview list shows once a search or a hub change settles: how many items, or the
 * no-match line when none (WCAG 4.1.3, HAL-14241), as the Runs list reads its filters. `search` is
 * the search and the hub as one string, so a refresh that changes the items isn't read; `text` is
 * `undefined` while there is no list to read. `announceState` waits for the typing to stop.
 */
export function useAnnounceListChange(
  search: string,
  text: string | undefined,
  announceState: ((key: string, text: string) => void) | undefined,
): void {
  const before = useRef(search);
  useEffect(() => {
    if (before.current === search || text === undefined) {
      return;
    }
    before.current = search;
    announceState?.("overview-list", text);
  }, [search, text, announceState]);
}
