import type { TabSetState } from "./tab-set.ts";

/** How many window tabs keep their page mounted, the active one included (UX checklist 1.2). */
export const mountedTabLimit = 5;

/**
 * The tabs whose pages stay mounted, the most recently active first: the active tab, then the
 * ones that were active before it, as many as `limit`. Tabs that have closed drop out, and an
 * older tab falls out once more recent ones fill the list. Returns `previous` itself when nothing
 * changed, so React can compare by identity.
 *
 * @example
 * mounted = mountedTabIds(mounted, tabs.state);
 */
export function mountedTabIds(
  previous: readonly string[],
  state: TabSetState,
  limit: number = mountedTabLimit,
): readonly string[] {
  const open = new Set(state.tabs.map((tab) => tab.id));
  const before = previous.filter((id) => id !== state.activeId && open.has(id));
  const next = [state.activeId, ...before].slice(0, limit);
  const same = next.length === previous.length && next.every((id, index) => id === previous[index]);
  return same ? previous : next;
}
