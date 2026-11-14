/** One item on an overview page: a skill, an agent, a routine. The feature builds it. */
export interface OverviewItem {
  /** Stable, never the index: focus and the search follow it. */
  readonly id: string;
  readonly name: string;
  /** What the item is for. The search reads it; the row doesn't show it. */
  readonly description?: string;
  /** The row's one line under the name: "Runs every morning". */
  readonly detail?: string;
  /** Pinned items come first in their section. */
  readonly pinned?: boolean;
}

/** A hub and the items of one kind in it. */
export interface OverviewHub {
  readonly id: string;
  readonly name: string;
  readonly items: readonly OverviewItem[];
}

/** The items shared into the workspace from outside its hubs. */
export interface OverviewShared {
  readonly workspaceName: string;
  readonly items: readonly OverviewItem[];
}

/** The id of the filter that shows every hub and the shared items. */
export const allFilter = "all";

/** The id of the filter that shows only the shared items. */
export const sharedFilter = "shared";

/** One section of the page: a hub's items, or the shared ones. */
export interface OverviewSection {
  /** The hub's id, or {@link sharedFilter}. */
  readonly id: string;
  readonly name: string;
  readonly items: readonly OverviewItem[];
}

/** What decides which sections show. */
export interface OverviewView {
  /** {@link allFilter}, {@link sharedFilter} or a hub's id. */
  readonly filter: string;
  /** The search field's text. */
  readonly query: string;
}

/** Whether the item's name, id, description or detail contains the text, ignoring case. */
export function itemMatches(item: OverviewItem, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") {
    return true;
  }
  return [item.name, item.id, item.description, item.detail].some((text) =>
    text?.toLowerCase().includes(wanted),
  );
}

/** Pinned items first; the others keep their order. */
function pinnedFirst(items: readonly OverviewItem[]): readonly OverviewItem[] {
  return [...items.filter((item) => item.pinned), ...items.filter((item) => !item.pinned)];
}

/**
 * The sections the page shows. Under "All" that is every hub, even an empty one, then
 * "Shared in <workspace>" when something is shared. A search hides the sections without a match.
 */
export function overviewSections(
  hubs: readonly OverviewHub[],
  shared: OverviewShared | undefined,
  view: OverviewView,
): readonly OverviewSection[] {
  const sections: OverviewSection[] = [];
  if (view.filter !== sharedFilter) {
    for (const hub of hubs) {
      if (view.filter === allFilter || view.filter === hub.id) {
        sections.push({ id: hub.id, name: hub.name, items: hub.items });
      }
    }
  }
  const showShared = view.filter === allFilter || view.filter === sharedFilter;
  if (showShared && shared !== undefined && shared.items.length > 0) {
    sections.push({
      id: sharedFilter,
      name: `Shared in ${shared.workspaceName}`,
      items: shared.items,
    });
  }
  const searching = view.query.trim() !== "";
  return sections
    .map((section) => ({
      ...section,
      items: pinnedFirst(section.items.filter((item) => itemMatches(item, view.query))),
    }))
    .filter((section) => !searching || section.items.length > 0);
}
