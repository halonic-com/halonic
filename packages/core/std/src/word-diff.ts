import { diffLines } from "./line-diff.ts";

/** A run of a text in a word diff: its `text`, and whether the other text doesn't have it. */
export interface WordPiece {
  readonly text: string;
  readonly changed: boolean;
}

/** Both texts of a word diff, each cut into pieces that join back to the text. */
export interface WordDiff {
  readonly before: readonly WordPiece[];
  readonly after: readonly WordPiece[];
}

/**
 * Words, runs of spaces and single other characters (punctuation, symbols).
 * Every character falls in one of them, so the tokens join back to the text.
 */
const tokenPattern = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

/**
 * The words that differ between two texts, so a page can mark them inside
 * the text rather than show two whole texts to compare by eye.
 *
 * Words, spaces and punctuation are compared as tokens, keeping the longest
 * run of common tokens (as `diffLines` does for lines). The spaces at either
 * end of a changed run are left unmarked, so the marks sit on the words.
 *
 * @param before - the text as it was
 * @param after - the text as it is now
 * @returns the pieces of each text, joining back to `before` and `after`
 *
 * @example
 * diffWords("Write short sentences.", "Write short, warm sentences.").after;
 * // [{ text: "Write short", changed: false }, { text: ", warm", changed: true },
 * //  { text: " sentences.", changed: false }]
 */
export function diffWords(before: string, after: string): WordDiff {
  const beforeTokens = before.match(tokenPattern) ?? [];
  const afterTokens = after.match(tokenPattern) ?? [];
  // diffLines compares lines, so each distinct token becomes a line of its own number.
  const numbers = new Map<string, number>();
  const asLines = (tokens: readonly string[]) =>
    tokens
      .map((token) => {
        const known = numbers.get(token);
        if (known !== undefined) return `${known}\n`;
        numbers.set(token, numbers.size);
        return `${numbers.size - 1}\n`;
      })
      .join("");
  const changes = diffLines(asLines(beforeTokens), asLines(afterTokens));
  const beforeChanged = new Array<boolean>(beforeTokens.length).fill(false);
  const afterChanged = new Array<boolean>(afterTokens.length).fill(false);
  for (const change of changes) {
    markRun(beforeTokens, beforeChanged, change.beforeStart, change.beforeEnd);
    markRun(afterTokens, afterChanged, change.afterStart, change.afterStart + change.added.length);
  }
  return {
    before: piecesOf(beforeTokens, beforeChanged),
    after: piecesOf(afterTokens, afterChanged),
  };
}

/** Marks the tokens from `start` up to `end` as changed, but not the spaces at either end. */
function markRun(tokens: readonly string[], changed: boolean[], start: number, end: number): void {
  let first = start;
  let last = end;
  while (first < last && isSpace(tokens[first])) first++;
  while (last > first && isSpace(tokens[last - 1])) last--;
  changed.fill(true, first, last);
}

function isSpace(token: string | undefined): boolean {
  return token !== undefined && /^\s+$/u.test(token);
}

/** The tokens joined into pieces, a new piece wherever `changed` flips. */
function piecesOf(tokens: readonly string[], changed: readonly boolean[]): WordPiece[] {
  const pieces: { text: string; changed: boolean }[] = [];
  tokens.forEach((token, index) => {
    const isChanged = changed[index] === true;
    const last = pieces.at(-1);
    if (last?.changed === isChanged) {
      last.text += token;
    } else {
      pieces.push({ text: token, changed: isChanged });
    }
  });
  return pieces;
}
