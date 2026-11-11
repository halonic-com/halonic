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

/** How the Search page's option chips narrow a match (microcopy 3.5): both off by default. */
export interface WordsOptions {
  /** "Match case": the words match only with the same capitals. */
  readonly matchCase: boolean;
  /** "Whole word": no letter or digit may touch the words on either side. */
  readonly wholeWord: boolean;
}

/** Both options off: what Ctrl K matches with. */
const anyWords: WordsOptions = { matchCase: false, wholeWord: false };

/**
 * Whether `name` matches the typed `words`, and how well. The words are plain text, never a
 * pattern, so `workspace.yaml`, `{ input` and `(EU)` match exactly those characters
 * (`search.files.plain-text-is-literal`). Case doesn't matter, Greek final sigma included, and a
 * run of spaces matches one space. There is no typo matching, so the results stay predictable.
 * Leading and trailing spaces in the words are ignored. The Search page passes its `options`, so
 * "Match case" and "Whole word" decide which places in the name count; Ctrl K passes none.
 *
 * @returns the best match, or `undefined` when the name doesn't contain the words or nothing is typed
 *
 * @example
 * matchName("sup", "Support reply"); // { rank: "starts-with", start: 0, end: 3 }
 * matchName("rep", "Support reply"); // { rank: "word-starts-with", start: 8, end: 11 }
 * matchName("Rep", "Support reply", { matchCase: true, wholeWord: false }); // undefined
 */
export function matchName(
  words: string,
  name: string,
  options: WordsOptions = anyWords,
): NameMatch | undefined {
  const query = fold(words.trim(), options.matchCase).text;
  if (query === "") {
    return undefined;
  }
  const folded = fold(name, options.matchCase);
  if (folded.text === query) {
    return { rank: "exact", start: 0, end: name.length };
  }
  // Where a character of the folded name starts in the name itself.
  const inName = (at: number) => folded.at[at] ?? name.length;
  let best: NameMatch | undefined;
  for (let at = folded.text.indexOf(query); at !== -1; at = folded.text.indexOf(query, at + 1)) {
    const found = { start: inName(at), end: inName(at + query.length) };
    if (options.wholeWord && !isWholeWord(name, found)) {
      continue;
    }
    const rank = rankAt(name, found.start);
    if (best === undefined || compareRanks(rank, best.rank) < 0) {
      best = { rank, ...found };
    }
    // Only the first place found can be the name's start, so nothing after a word's start beats it.
    if (rank !== "contains") {
      break;
    }
  }
  return best;
}

/** How well a match that isn't the whole name ranks, by where it starts. */
function rankAt(name: string, start: number): NameMatchRank {
  if (start === 0) {
    return "starts-with";
  }
  return startsWord(name, start) ? "word-starts-with" : "contains";
}

/** Where the words were found in a text, in UTF-16 code units, the end exclusive. */
export interface WordsFound {
  readonly start: number;
  readonly end: number;
}

/**
 * Where `text` first contains the typed `words`, read as plain text the same way `matchName`
 * reads them (`search.files.plain-text-is-literal`), and narrowed by the Search page's options.
 * A run of spaces matches one space, and without "Match case" capitals don't matter.
 *
 * @returns where the words are, or `undefined` when the text doesn't contain them or nothing is typed
 *
 * @example
 * findWords("triage", "Triage flow", { matchCase: true, wholeWord: false }); // undefined
 * findWords("triage", "triaged", { matchCase: false, wholeWord: true }); // undefined
 */
export function findWords(
  words: string,
  text: string,
  options: WordsOptions,
): WordsFound | undefined {
  const query = fold(words.trim(), options.matchCase).text;
  if (query === "") {
    return undefined;
  }
  const folded = fold(text, options.matchCase);
  const inText = (at: number) => folded.at[at] ?? text.length;
  for (let at = folded.text.indexOf(query); at !== -1; at = folded.text.indexOf(query, at + 1)) {
    const found = { start: inText(at), end: inText(at + query.length) };
    if (!options.wholeWord || isWholeWord(text, found)) {
      return found;
    }
  }
  return undefined;
}

/** Compares two matches: below zero when `left` is the better one. */
export function compareNameMatches(left: NameMatch, right: NameMatch): number {
  return compareRanks(left.rank, right.rank);
}

function compareRanks(left: NameMatchRank, right: NameMatchRank): number {
  return nameMatchRanks.indexOf(left) - nameMatchRanks.indexOf(right);
}

/** Whether no letter or digit touches the found text on either side. */
function isWholeWord(text: string, found: WordsFound): boolean {
  const after = text.codePointAt(found.end);
  const endsWord = after === undefined || !letterOrDigit.test(String.fromCodePoint(after));
  return startsWord(text, found.start) && endsWord;
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
 * maps back to the text one character at a time. With `keepCase`, only the spaces are folded.
 */
function fold(text: string, keepCase = false): Folded {
  let folded = "";
  const at: number[] = [];
  let index = 0;
  for (const character of text) {
    const isSpace = whiteSpace.test(character);
    if (!(isSpace && folded.endsWith(" "))) {
      const cased = keepCase ? character : lowerCase(character);
      const lower = isSpace ? " " : cased;
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
