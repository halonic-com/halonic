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
const whiteSpace = /\s/u;

/**
 * Whether `name` matches the typed `words`, and how well. The words are plain text, never a
 * pattern, so `workspace.yaml`, `{ input` and `(EU)` match exactly those characters
 * (`search.files.plain-text-is-literal`). Case doesn't matter, Greek final sigma included, and a
 * run of spaces matches one space. There is no typo matching, so the results stay predictable.
 * Leading and trailing spaces in the words are ignored.
 *
 * @returns the match, or `undefined` when the name doesn't contain the words or nothing is typed
 *
 * @example
 * matchName("sup", "Support reply"); // { rank: "starts-with", start: 0, end: 3 }
 * matchName("rep", "Support reply"); // { rank: "word-starts-with", start: 8, end: 11 }
 */
export function matchName(words: string, name: string): NameMatch | undefined {
  const query = fold(words.trim()).text;
  if (query === "") {
    return undefined;
  }
  const folded = fold(name);
  // Where a character of the folded name starts in the name itself.
  const inName = (at: number) => folded.at[at] ?? name.length;
  if (folded.text === query) {
    return { rank: "exact", start: 0, end: name.length };
  }
  const first = folded.text.indexOf(query);
  if (first === -1) {
    return undefined;
  }
  const found = (rank: NameMatchRank, at: number): NameMatch => ({
    rank,
    start: inName(at),
    end: inName(at + query.length),
  });
  if (first === 0) {
    return found("starts-with", 0);
  }
  for (let at = first; at !== -1; at = folded.text.indexOf(query, at + 1)) {
    if (startsWord(name, inName(at))) {
      return found("word-starts-with", at);
    }
  }
  return found("contains", first);
}

/** Compares two matches: below zero when `left` is the better one. */
export function compareNameMatches(left: NameMatch, right: NameMatch): number {
  return nameMatchRanks.indexOf(left.rank) - nameMatchRanks.indexOf(right.rank);
}

/**
 * Whether a word starts at `index`: the character before it isn't a letter or a digit. The
 * character is read whole, so a letter outside the BMP, such as "𝐀", isn't taken for a break.
 */
function startsWord(name: string, index: number): boolean {
  const before = characterBefore(name, index);
  return before === undefined || !letterOrDigit.test(before);
}

/** The character that ends right before `index`, both halves of a surrogate pair included. */
function characterBefore(text: string, index: number): string | undefined {
  if (index === 0) {
    return undefined;
  }
  const last = text.charCodeAt(index - 1);
  const isLowSurrogate = last >= 0xdc00 && last <= 0xdfff;
  const start = isLowSurrogate && index >= 2 ? index - 2 : index - 1;
  return String.fromCodePoint(text.codePointAt(start) ?? last);
}

/** Text folded for matching, with where each of its characters starts in the text. */
interface Folded {
  readonly text: string;
  /** `at[i]` is the index in the text of the folded text's code unit `i`. */
  readonly at: readonly number[];
}

/**
 * Lower case for matching: a run of spaces becomes one space and final sigma "ς" becomes "σ". A
 * character whose lower case has another length, such as "İ", stays as it is, so the folded text
 * maps back to the text one character at a time.
 */
function fold(text: string): Folded {
  let folded = "";
  const at: number[] = [];
  let index = 0;
  for (const character of text) {
    const isSpace = whiteSpace.test(character);
    if (!(isSpace && folded.endsWith(" "))) {
      const lower = isSpace ? " " : lowerCase(character);
      folded += lower;
      for (let unit = 0; unit < lower.length; unit++) {
        at.push(index + unit);
      }
    }
    index += character.length;
  }
  return { text: folded, at };
}

function lowerCase(character: string): string {
  const lower = character.toLowerCase();
  if (lower === "ς") {
    return "σ";
  }
  return lower.length === character.length ? lower : character;
}
