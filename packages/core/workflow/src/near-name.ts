/** How far a misspelled name may be from a real one for "Did you mean": the CLI's limit (cli-output 1.3). */
const nearDistance = 2;

/**
 * The one name within an edit distance of 2 of `typed`, for "Did you mean".
 * When none is that close, or two or more are, there's no guess: a guess
 * between two would be a coin toss.
 *
 * @example
 * nearName("replly", ["kind", "reply"]); // "reply"
 * nearName("xyz", ["kind", "reply"]); // undefined
 */
export function nearName(typed: string, names: readonly string[]): string | undefined {
  const near = names.filter((name) => editDistance(typed, name) <= nearDistance);
  return near.length === 1 ? near[0] : undefined;
}

/**
 * The one name the typed name likely meant, for "Did you mean": the name that
 * differs only in upper and lower case (`Sorter` for `sorter`), or else the
 * one near spelling ({@link nearName}), case aside.
 *
 * @example
 * likelyName("Sorter", ["sorter", "writer"]); // "sorter"
 * likelyName("reveiw", ["draft", "review"]); // "review"
 */
export function likelyName(typed: string, names: readonly string[]): string | undefined {
  const lower = typed.toLowerCase();
  const sameLetters = names.filter((name) => name.toLowerCase() === lower);
  if (sameLetters.length > 0) {
    return sameLetters.length === 1 ? sameLetters[0] : undefined;
  }
  const near = nearName(
    lower,
    names.map((name) => name.toLowerCase()),
  );
  return near === undefined ? undefined : names.find((name) => name.toLowerCase() === near);
}

/**
 * What follows an unknown name's message: `. Did you mean "<name>"?` with a
 * likely name, or nothing, so a message without one stays as it was.
 */
export function didYouMean(typed: string, names: readonly string[]): string {
  const likely = likelyName(typed, names);
  return likely === undefined ? "" : `. Did you mean "${likely}"?`;
}

/**
 * The fewest single-character insertions, deletions, substitutions and swaps
 * of two neighbours that turn `from` into `to` (optimal string alignment), so
 * "knid" is one step from "kind".
 */
export function editDistance(from: string, to: string): number {
  // One row per prefix of `from`: the distance between its first i characters
  // and the first j of `to`. Only the last two rows are needed.
  let beforeLast: number[] = [];
  let last = Array.from({ length: to.length + 1 }, (_, j) => j);
  for (let i = 1; i <= from.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= to.length; j += 1) {
      const substitution = from[i - 1] === to[j - 1] ? 0 : 1;
      let best = Math.min(
        (last[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (last[j - 1] ?? 0) + substitution,
      );
      const swapped = i > 1 && j > 1 && from[i - 1] === to[j - 2] && from[i - 2] === to[j - 1];
      if (swapped) {
        best = Math.min(best, (beforeLast[j - 2] ?? 0) + 1);
      }
      row.push(best);
    }
    beforeLast = last;
    last = row;
  }
  return last[to.length] ?? 0;
}
