/** One item on an overview page: a skill, an agent, a routine. The feature builds it. */
export interface OverviewItem {
  /** Stable, never the index: focus and the search follow it. */
  readonly id: string;
  readonly name: string;
  /** What the item is for. The search reads it; the row doesn't show it. */
  readonly description?: string;
  /** The row's one line under the name: "Runs every morning". */
  readonly detail?: string;
  /** What uses the item, on the row's right: "Used by 2 agents". The search doesn't read it. */
  readonly usedBy?: string;
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

/**
 * The id of the filter, and the key of the section, of one hub. Hub ids are user-chosen, so the
 * prefix keeps a hub called "all" or "shared" apart from {@link allFilter} and {@link sharedFilter}.
 */
export function hubFilter(hubId: string): string {
  return `hub:${hubId}`;
}

/** One section of the page: a hub's items, or the shared ones. */
export interface OverviewSection {
  /** {@link hubFilter} of the hub, or {@link sharedFilter}. */
  readonly id: string;
  /** The hub's name, or the workspace's name for the shared section: the page words the heading. */
  readonly name: string;
  readonly shared: boolean;
  readonly items: readonly OverviewItem[];
}

/** What decides which sections show. */
export interface OverviewView {
  /** {@link allFilter}, {@link sharedFilter} or {@link hubFilter} of a hub. */
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
 * the shared section when something is shared. A search hides the sections without a match.
 */
export function overviewSections(
  hubs: readonly OverviewHub[],
  shared: OverviewShared | undefined,
  view: OverviewView,
): readonly OverviewSection[] {
  const sections: OverviewSection[] = [];
  if (view.filter !== sharedFilter) {
    for (const hub of hubs) {
      if (view.filter === allFilter || view.filter === hubFilter(hub.id)) {
        sections.push({ id: hubFilter(hub.id), name: hub.name, shared: false, items: hub.items });
      }
    }
  }
  const showShared = view.filter === allFilter || view.filter === sharedFilter;
  if (showShared && shared !== undefined && shared.items.length > 0) {
    sections.push({
      id: sharedFilter,
      name: shared.workspaceName,
      shared: true,
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

/** One hub filter chip: its {@link OverviewView.filter} id and the words it shows. */
export interface OverviewChip {
  readonly value: string;
  readonly label: string;
}

/**
 * The hub filter chips: "All", one per hub, and the shared one when something is shared. The
 * shared chip is named by the page's words, so it takes the label as an argument.
 */
export function overviewChips(
  hubs: readonly OverviewHub[],
  shared: OverviewShared | undefined,
  words: { readonly all: string; readonly shared: (workspaceName: string) => string },
): readonly OverviewChip[] {
  const chips: OverviewChip[] = [
    { value: allFilter, label: words.all },
    ...hubs.map((hub) => ({ value: hubFilter(hub.id), label: hub.name })),
  ];
  if (shared !== undefined && shared.items.length > 0) {
    chips.push({ value: sharedFilter, label: words.shared(shared.workspaceName) });
  }
  return chips;
}

/** The filter to use: the chosen one while its chip still exists, "All" when it has gone. */
export function currentFilter(filter: string, chips: readonly OverviewChip[]): string {
  return chips.some((chip) => chip.value === filter) ? filter : allFilter;
}
