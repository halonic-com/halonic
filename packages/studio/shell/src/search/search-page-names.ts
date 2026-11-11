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
  /**
   * Where the words are in `label` and how well they match, to highlight and rank it; none when
   * only the description matches.
   */
  readonly labelMatch?: NameMatch;
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
 * and the In and Hub chips. An item found twice shows once, with the description any provider
 * gave. Items whose name matches come first, ranked as Ctrl K ranks names (the whole name, its
 * start, a word's start, anywhere) with the same options, then items whose description alone
 * matches; equal ones keep the providers' order. Unlike Ctrl K, recently opened items don't come
 * first among equals. A provider's own looser match doesn't count: the words must be
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
  const matching = mergeRepeats(found)
    .map((result) => nameResult(query, result))
    .filter((result) => result !== undefined);
  const results = ranked(matching.filter(inScope(query.scope)));
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
  const labelMatch = matchName(query.words, result.label, query.options);
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
 * The results with a name match first, best first, then those whose description alone matches.
 * The rank comes from the highlighted match, so the order agrees with what the page highlights.
 */
function ranked(results: readonly NameResult[]): NameResult[] {
  // Array sort is stable, so equal results keep the providers' order.
  return [...results].sort((left, right) => compareRanks(left.labelMatch, right.labelMatch));
}

/** Compares two name ranks, a missing one (description only) last. */
function compareRanks(left: NameMatch | undefined, right: NameMatch | undefined): number {
  if (left === undefined || right === undefined) {
    return Number(left === undefined) - Number(right === undefined);
  }
  return compareNameMatches(left, right);
}

/**
 * One result for each item, so an item two providers found shows once. The first provider's
 * result counts, and a later one only adds the detail or description the first one left out, so
 * an item found by its name in one provider is still found by its description from another.
 */
function mergeRepeats(found: readonly SearchResult[]): SearchResult[] {
  const byKey = new Map<string, SearchResult>();
  for (const result of found) {
    const key = itemLocationKey(result.item);
    const first = byKey.get(key);
    byKey.set(key, first === undefined ? result : { ...result, ...first });
  }
  // A map keeps the order its keys were first set in, so the providers' order stays.
  return [...byKey.values()];
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}
