import { useEffect, useRef } from "react";
import type { RunsFilters } from "./runs-filter.ts";

/**
 * Reads how many runs the list shows once a filter change settles, or the filter's own line when it
 * shows none (a11y check A4). A refresh isn't a filter change: rows that change status aren't read
 * (mc 19.3, revision 115). The filters are compared by value, so taking a workflow request the page
 * already opened with isn't a change either.
 */
export function useAnnounceFilterChange(
  filters: RunsFilters,
  text: string | undefined,
  announceState: ((key: string, text: string) => void) | undefined,
): void {
  const key = filtersKey(filters);
  const before = useRef(key);
  useEffect(() => {
    if (before.current === key || text === undefined) {
      return;
    }
    before.current = key;
    announceState?.("runs-filter", text);
  }, [key, text, announceState]);
}

/** The filters as one string: the same filters give the same string. */
function filtersKey({ status, testRuns, workflow }: RunsFilters): string {
  return JSON.stringify([status, testRuns, workflow?.hubId ?? null, workflow?.id ?? null]);
}
