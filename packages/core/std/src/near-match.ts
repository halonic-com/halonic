/** How far a typo may be from a name for "Did you mean": the CLI's limit (cli-output 1.3). */
const nearDistance = 2;

/** Options for {@link nearMatch}. */
export interface NearMatchOptions {
  /**
   * Other spellings a candidate may be found by, besides itself. The CLI
   * passes the stem `--x` of an option `--no-x`, so "--colour" finds "--no-color".
   */
  readonly spellingsOf?: (candidate: string) => readonly string[];
}

/**
 * The one candidate within an edit distance of 2 of `typed`, for "Did you
 * mean". When none is that close, or two or more are, there's no guess: a
 * guess between two would be a coin toss. Only for names that have to be one
 * of a known list, never for a name the user may have typed on purpose.
 *
 * @example
 * nearMatch("tset", ["init", "test", "trust"]); // "test"
 * nearMatch("rux", ["run", "runs"]); // undefined: two are as close
 */
export function nearMatch(
  typed: string,
  candidates: readonly string[],
  options: NearMatchOptions = {},
): string | undefined {
  const spellingsOf = options.spellingsOf ?? (() => []);
  const near = candidates.filter((candidate) =>
    [candidate, ...spellingsOf(candidate)].some(
      (spelling) => editDistance(typed, spelling) <= nearDistance,
    ),
  );
  return near.length === 1 ? near[0] : undefined;
}

/**
 * The fewest single-character insertions, deletions, substitutions and swaps
 * of two neighbours that turn `from` into `to` (optimal string alignment), so
 * "tset" is one step from "test".
 *
 * @example
 * editDistance("tset", "test"); // 1
 * editDistance("", "run"); // 3
 */
export function editDistance(from: string, to: string): number {
  // A table with one cell per pair of prefixes: the distance between the first i
  // characters of `from` and the first j of `to`, stored row by row.
  const width = to.length + 1;
  const cells = new Array<number>((from.length + 1) * width).fill(0);
  const at = (i: number, j: number): number => cells[i * width + j] ?? 0;
  const set = (i: number, j: number, value: number): void => {
    cells[i * width + j] = value;
  };
  for (let i = 0; i <= from.length; i += 1) {
    set(i, 0, i);
  }
  for (let j = 0; j <= to.length; j += 1) {
    set(0, j, j);
  }
  for (let i = 1; i <= from.length; i += 1) {
    for (let j = 1; j <= to.length; j += 1) {
      const substitution = from[i - 1] === to[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + substitution);
      const swapped = i > 1 && j > 1 && from[i - 1] === to[j - 2] && from[i - 2] === to[j - 1];
      if (swapped) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      set(i, j, best);
    }
  }
  return at(from.length, to.length);
}
