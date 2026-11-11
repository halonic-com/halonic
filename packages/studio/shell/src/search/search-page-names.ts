import {
  compareNameMatches,
  findWords,
  matchName,
  type NameMatch,
  type WordsFound,
  type WordsOptions,
} from "../palette/name-match.ts";
import { itemLocationKey } from "../palette/palette-groups.ts";
import type { SearchResult } from "../points/commands.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import type { TabLocation } from "../tabs/tab-set.ts";

/** Every Search page place's key starts with this, then the words. */
const searchKeyPrefix = "search:";

/**
 * The Search page for some words, as a place a tab shows: its tab reads "Search: refund" (VK
 * T2-F7). Each search is its own place, so Back goes to the words searched before.
 */
export function searchPageLocation(words: string): TabLocation {
  const trimmed = words.trim();
  return { key: `${searchKeyPrefix}${trimmed}`, title: `Search: ${trimmed}` };
}

/** The words a Search page place searches, or `undefined` when the place isn't the Search page. */
export function searchPageWords(location: TabLocation): string | undefined {
  return location.key.startsWith(searchKeyPrefix)
    ? location.key.slice(searchKeyPrefix.length)
    : undefined;
}

/** What the In and Hub chips narrow the results to; a missing one is "Everything" or "All hubs". */
export interface SearchScope {
  /** An item kind, such as `agent`. */
  readonly kind?: string;
  /** A hub, such as `acme`. */
  readonly hub?: string;
}

/** What the Search page searches for. */
export interface SearchPageQuery {
  /** The words in the box, read as plain text. */
  readonly words: string;
  /** The Match case and Whole word chips. */
  readonly options: WordsOptions;
  readonly scope: SearchScope;
}

/** An item whose name or description contains the words. */
export interface NameResult {
  /** The item's place key, `kind/hub/id`, unique on the page. */
  readonly key: string;
  readonly item: ItemRef;
  readonly label: string;
  /** The kind and hub, such as "Agent · acme". */
  readonly detail?: string;
  readonly description?: string;
  /** Where the words are in `label`, to highlight them; none when only the description matches. */
  readonly labelMatch?: WordsFound;
  /** Where the words are in `description`. */
  readonly descriptionMatch?: WordsFound;
}

/** The Search page's "Names and descriptions" section and what its chips and states need. */
export interface SearchPageNames {
  /** The matching items in scope, best first. */
  readonly results: readonly NameResult[];
  /** The kinds of the matching items before the In chip narrows them, for its picker, in order found. */
  readonly kinds: readonly string[];
  /** The hubs of the matching items before the Hub chip narrows them, for its picker, in order found. */
  readonly hubs: readonly string[];
  /** Words are typed and nothing in scope matches, so the empty state shows. */
  readonly nothingFound: boolean;
  /**
   * Nothing in scope matches but a hub is picked, so the empty state offers "Search all hubs"
   * (VK T2-F26), whether or not other hubs have matches.
   */
  readonly offerAllHubs: boolean;
  /** Nothing in scope matches and a search provider failed, so the page says "Couldn't search". */
  readonly couldNotSearch: boolean;
}

/**
 * The "Names and descriptions" section of the Search page (VK T2-F7): every found item whose name
 * or description contains the words, read as plain text and narrowed by Match case, Whole word
 * and the In and Hub chips. An item found twice shows once. Items whose name matches come first,
 * best match first in the same order as Ctrl K, then items whose description alone matches; equal
 * ones keep the providers' order. A provider's own looser match doesn't count: the words must be
 * in the name or the description as the options say.
 *
 * @param found what the search providers found for the words, in provider order
 * @param searchFailed whether a search provider failed (`FoundItems.failed`)
 */
export function searchPageNames(
  query: SearchPageQuery,
  found: readonly SearchResult[],
  searchFailed: boolean,
): SearchPageNames {
  const matching = withoutRepeats(found)
    .map((result) => nameResult(query, result))
    .filter((result) => result !== undefined);
  const results = ranked(query.words, matching.filter(inScope(query.scope)));
  const nothingInScope = query.words.trim() !== "" && results.length === 0;
  return {
    results,
    kinds: distinct(matching.map((result) => result.item.kind)),
    hubs: distinct(matching.map((result) => result.item.hub)),
    nothingFound: nothingInScope && !searchFailed,
    offerAllHubs: nothingInScope && !searchFailed && query.scope.hub !== undefined,
    couldNotSearch: nothingInScope && searchFailed,
  };
}

/** The result with where the words are, or `undefined` when neither its name nor description has them. */
function nameResult(query: SearchPageQuery, result: SearchResult): NameResult | undefined {
  const labelMatch = findWords(query.words, result.label, query.options);
  const descriptionMatch =
    result.description === undefined
      ? undefined
      : findWords(query.words, result.description, query.options);
  if (labelMatch === undefined && descriptionMatch === undefined) {
    return undefined;
  }
  return {
    key: itemLocationKey(result.item),
    item: result.item,
    label: result.label,
    ...(result.detail === undefined ? {} : { detail: result.detail }),
    ...(result.description === undefined ? {} : { description: result.description }),
    ...(labelMatch === undefined ? {} : { labelMatch }),
    ...(descriptionMatch === undefined ? {} : { descriptionMatch }),
  };
}

function inScope(scope: SearchScope): (result: NameResult) => boolean {
  return (result) =>
    (scope.kind === undefined || result.item.kind === scope.kind) &&
    (scope.hub === undefined || result.item.hub === scope.hub);
}

/**
 * The results with a name match first, ranked as Ctrl K ranks names, then those whose description
 * alone matches. The rank only orders: the options already decided what matches.
 */
function ranked(words: string, results: readonly NameResult[]): NameResult[] {
  const rank = (result: NameResult): NameMatch | undefined =>
    result.labelMatch === undefined ? undefined : matchName(words, result.label);
  // Array sort is stable, so equal results keep the providers' order.
  return [...results].sort((left, right) => compareRanks(rank(left), rank(right)));
}

/** Compares two name ranks, a missing one (description only) last. */
function compareRanks(left: NameMatch | undefined, right: NameMatch | undefined): number {
  if (left === undefined || right === undefined) {
    return Number(left === undefined) - Number(right === undefined);
  }
  return compareNameMatches(left, right);
}

/** The results with the first of each item, so an item two providers found shows once. */
function withoutRepeats(found: readonly SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return found.filter((result) => {
    const key = itemLocationKey(result.item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * The count line over the results, "3 matches in 3 items", in the words of microcopy 3.5. Each
 * item in "Names and descriptions" is one match.
 */
export function searchPageCount(names: SearchPageNames): string {
  const count = names.results.length;
  return `${count} ${count === 1 ? "match" : "matches"} in ${count} ${count === 1 ? "item" : "items"}`;
}
