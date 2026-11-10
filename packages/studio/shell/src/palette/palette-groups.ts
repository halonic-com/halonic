import type { CommandContribution, SearchResult } from "../points/commands.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import type { TabLocation } from "../tabs/tab-set.ts";
import { compareNameMatches, matchName, type NameMatch } from "./name-match.ts";

/** The palette's groups, in the order they show (component specs 24.3). */
export const paletteGroupTitles = {
  "open-tabs": "Open tabs",
  recent: "Recent",
  items: "Agents, workflows and more",
  actions: "Actions",
} as const;

export type PaletteGroupId = keyof typeof paletteGroupTitles;

/** Each group shows at most this many rows. */
export const paletteGroupRows = 5;

/** What Enter on a row opens or runs. */
export type PaletteTarget =
  | { readonly kind: "location"; readonly location: TabLocation }
  | { readonly kind: "item"; readonly item: ItemRef }
  | { readonly kind: "action"; readonly command: string };

/** One row of the palette. */
export interface PaletteRow {
  /** Unique in the palette: a place's key, or `action:` and the command's id. */
  readonly key: string;
  readonly label: string;
  /** The kind and hub, such as "Agent · Billing", when a search provider gave them. */
  readonly detail?: string;
  /** Where the typed words are in `label`; none when nothing is typed. */
  readonly match?: NameMatch;
  /** Whether a window tab shows it already, so the row says "Switch to tab". */
  readonly open: boolean;
  readonly target: PaletteTarget;
}

export interface PaletteGroup {
  readonly id: PaletteGroupId;
  readonly title: string;
  readonly rows: readonly PaletteRow[];
}

/** What the palette shows. */
export interface PaletteContent {
  /** Only the groups with rows, in order. */
  readonly groups: readonly PaletteGroup[];
  /** Words are typed and no place or item matches them, so the "Nothing matches" line shows. */
  readonly nothingFound: boolean;
  /**
   * Words are typed, no place or item matches them and a search provider failed, so the palette
   * says "Couldn't search" (T2-F25) in place of "Nothing matches".
   */
  readonly couldNotSearch: boolean;
}

/** What the palette ranks and groups. */
export interface PaletteSources {
  /** The words in the box. */
  readonly words: string;
  /** The places the window's tabs show, in strip order. */
  readonly openTabs: readonly TabLocation[];
  /** Places opened lately, the latest first. */
  readonly recent: readonly TabLocation[];
  /** What the search providers found for the words, in provider order. */
  readonly found: readonly SearchResult[];
  /** Whether a search provider failed (`FoundItems.failed`). */
  readonly searchFailed: boolean;
  /** The commands people can run. */
  readonly actions: readonly Pick<CommandContribution, "id" | "title">[];
}

/**
 * The key of the place that shows an item, as a deep link writes it: `kind/hub/id`. A window tab
 * on that item has the same key, so the palette can tell it is open.
 */
export function itemLocationKey(item: ItemRef): string {
  return `${item.kind}/${item.hub}/${item.id}`;
}

/**
 * Ranks and groups what Ctrl K shows (design-search 2, component specs 24.3). With nothing typed:
 * Open tabs, then Recent places that no tab shows. With words typed: "Agents, workflows and
 * more", the places and items whose name matches, and Actions, the commands whose title does.
 * In a group the whole name comes first, then names that start with the words, then a word that
 * starts with them, then names that only contain them; among equal matches the more recently
 * opened comes first. Each group keeps its best 5 rows. A source that isn't built yet adds
 * nothing, so it never shows an error or a stand-in. When nothing matches because a provider
 * failed, the palette says it couldn't search rather than that nothing matches; when other
 * providers found something, it shows that.
 */
export function paletteGroups(sources: PaletteSources): PaletteContent {
  const openKeys = new Set(sources.openTabs.map((location) => location.key));
  const placeRow = (location: TabLocation): PaletteRow => ({
    key: location.key,
    label: location.title,
    open: openKeys.has(location.key),
    target: { kind: "location", location },
  });

  if (sources.words.trim() === "") {
    const recent = sources.recent.filter((location) => !openKeys.has(location.key));
    return {
      groups: nonEmpty([
        group("open-tabs", sources.openTabs.map(placeRow)),
        group("recent", recent.map(placeRow)),
      ]),
      nothingFound: false,
      couldNotSearch: false,
    };
  }

  const foundRows = sources.found.map((result): PaletteRow => {
    const key = itemLocationKey(result.item);
    return {
      key,
      label: result.label,
      ...(result.detail === undefined ? {} : { detail: result.detail }),
      open: openKeys.has(key),
      target: { kind: "item", item: result.item },
    };
  });
  const placeRows = [...sources.openTabs, ...sources.recent].map(placeRow);
  const recency = new Map(sources.recent.map((location, index) => [location.key, index]));
  const items = ranked(sources.words, withoutRepeats([...foundRows, ...placeRows]), recency);
  const actions = ranked(
    sources.words,
    sources.actions.map(
      (action): PaletteRow => ({
        key: `action:${action.id}`,
        label: action.title,
        open: false,
        target: { kind: "action", command: action.id },
      }),
    ),
    new Map(),
  );
  return {
    groups: nonEmpty([group("items", items), group("actions", actions)]),
    nothingFound: items.length === 0 && !sources.searchFailed,
    couldNotSearch: items.length === 0 && sources.searchFailed,
  };
}

/**
 * The rows whose label matches the words, best first: by how well they match, then by how
 * recently they were opened, then in the order given.
 */
function ranked(
  words: string,
  rows: readonly PaletteRow[],
  recency: ReadonlyMap<string, number>,
): PaletteRow[] {
  const matching: { row: PaletteRow; match: NameMatch }[] = [];
  for (const row of rows) {
    const match = matchName(words, row.label);
    if (match !== undefined) {
      matching.push({ row: { ...row, match }, match });
    }
  }
  const recentIndex = (row: PaletteRow) => recency.get(row.key) ?? Number.POSITIVE_INFINITY;
  // Array sort is stable, so equal rows keep the order given.
  matching.sort(
    (left, right) =>
      compareNameMatches(left.match, right.match) ||
      compareRecency(recentIndex(left.row), recentIndex(right.row)),
  );
  return matching.map(({ row }) => row);
}

function compareRecency(left: number, right: number): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** The rows with the first of each key, so an item found and also open shows once. */
function withoutRepeats(rows: readonly PaletteRow[]): PaletteRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) {
      return false;
    }
    seen.add(row.key);
    return true;
  });
}

function group(id: PaletteGroupId, rows: readonly PaletteRow[]): PaletteGroup {
  return { id, title: paletteGroupTitles[id], rows: rows.slice(0, paletteGroupRows) };
}

function nonEmpty(groups: readonly PaletteGroup[]): PaletteGroup[] {
  return groups.filter((candidate) => candidate.rows.length > 0);
}
