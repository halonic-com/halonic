/**
 * How well a name matches the words typed in Ctrl K, best first (design-search 2): the whole
 * name, the name's start, the start of a word in the name, anywhere in the name.
 */
export const nameMatchRanks = ["exact", "starts-with", "word-starts-with", "contains"] as const;

export type NameMatchRank = (typeof nameMatchRanks)[number];

/** A name that matches, how well, and where the words are in it, to highlight them. */
export interface NameMatch {
  readonly rank: NameMatchRank;
  /** Where the typed words start in the name, in UTF-16 code units. */
  readonly start: number;
  /** Where they end, exclusive. */
  readonly end: number;
}

const letterOrDigit = /[\p{L}\p{N}]/u;

/**
 * Whether `name` matches the typed `words`, and how well. The words are plain text, never a
 * pattern, so `workspace.yaml`, `{ input` and `(EU)` match exactly those characters
 * (`search.files.plain-text-is-literal`). Case doesn't matter. There is no typo matching, so the
 * results stay predictable. Leading and trailing spaces in the words are ignored.
 *
 * @returns the match, or `undefined` when the name doesn't contain the words or nothing is typed
 *
 * @example
 * matchName("sup", "Support reply"); // { rank: "starts-with", start: 0, end: 3 }
 * matchName("rep", "Support reply"); // { rank: "word-starts-with", start: 8, end: 11 }
 */
export function matchName(words: string, name: string): NameMatch | undefined {
  const query = foldCase(words.trim());
  if (query === "") {
    return undefined;
  }
  const folded = foldCase(name);
  if (folded === query) {
    return { rank: "exact", start: 0, end: name.length };
  }
  const first = folded.indexOf(query);
  if (first === -1) {
    return undefined;
  }
  if (first === 0) {
    return { rank: "starts-with", start: 0, end: query.length };
  }
  for (let at = first; at !== -1; at = folded.indexOf(query, at + 1)) {
    if (startsWord(name, at)) {
      return { rank: "word-starts-with", start: at, end: at + query.length };
    }
  }
  return { rank: "contains", start: first, end: first + query.length };
}

/** Compares two matches: below zero when `left` is the better one. */
export function compareNameMatches(left: NameMatch, right: NameMatch): number {
  return nameMatchRanks.indexOf(left.rank) - nameMatchRanks.indexOf(right.rank);
}

/** Whether a word starts at `index`: the character before it isn't a letter or a digit. */
function startsWord(name: string, index: number): boolean {
  const before = name[index - 1];
  return before === undefined || !letterOrDigit.test(before);
}

/**
 * Lower case that keeps every character's place, so a match found in the folded text sits at the
 * same index in the name. A character whose lower case is longer, such as "İ", stays as it is.
 */
function foldCase(text: string): string {
  let folded = "";
  for (const character of text) {
    const lower = character.toLowerCase();
    folded += lower.length === character.length ? lower : character;
  }
  return folded;
}
