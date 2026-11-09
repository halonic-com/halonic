/** How many edits apart a mistyped name may be for "Did you mean" (cli-output 1.3). */
const maxDistance = 2;

/**
 * The one name the user probably meant, for "Did you mean …?": the name
 * within {@link maxDistance} edits of `typed`, when exactly one is. With
 * none, or more than one, there's no guess.
 */
export function closestName(typed: string, names: readonly string[]): string | undefined {
  const close = names.filter((name) => editDistance(typed, name) <= maxDistance);
  return close.length === 1 ? close[0] : undefined;
}

/** The fewest single-letter inserts, deletes and swaps that turn `a` into `b` (Levenshtein). */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const replace = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, replace));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}
