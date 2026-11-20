/** How far a typo may be from a name for "Did you mean": the CLI's limit for a command (cli-output 1.3). */
const nearDistance = 2;

/**
 * The one name within an edit distance of 2 of `typed`, for "Did you mean".
 * When none is that close, or two or more are, there's no guess: a guess
 * between two would be a coin toss.
 *
 * @example
 * nearMatch("soter", ["writer", "sorter"]); // "sorter"
 * nearMatch("xyz", ["writer", "sorter"]); // undefined
 */
export function nearMatch(typed: string, candidates: Iterable<string>): string | undefined {
  const near = [...new Set(candidates)].filter(
    (candidate) => editDistance(typed, candidate) <= nearDistance,
  );
  return near.length === 1 ? near[0] : undefined;
}

/**
 * The fewest single-character insertions, deletions, substitutions and swaps
 * of two neighbours that turn `from` into `to` (optimal string alignment), so
 * "nmae" and "name" are one step apart.
 */
export function editDistance(from: string, to: string): number {
  // A table with one cell per pair of prefixes: the distance between the first i
  // characters of `from` and the first j of `to`, stored row by row.
  const width = to.length + 1;
  const cells = new Array<number>((from.length + 1) * width).fill(0);
  const at = (i: number, j: number): number => cells[i * width + j] ?? 0;
  for (let i = 0; i <= from.length; i += 1) {
    for (let j = 0; j <= to.length; j += 1) {
      if (i === 0 || j === 0) {
        cells[i * width + j] = i + j;
        continue;
      }
      const substitution = from[i - 1] === to[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + substitution);
      const swapped = i > 1 && j > 1 && from[i - 1] === to[j - 2] && from[i - 2] === to[j - 1];
      if (swapped) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      cells[i * width + j] = best;
    }
  }
  return at(from.length, to.length);
}
