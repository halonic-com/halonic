import { nearMatch } from "@halonicjs/std";

/**
 * The one name the typed name likely meant, for "Did you mean": the name that
 * differs only in upper and lower case (`Sorter` for `sorter`), or else the
 * one near spelling (std's `nearMatch`), case aside.
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
  const near = nearMatch(
    lower,
    names.map((name) => name.toLowerCase()),
  );
  // Two names that differ only in case are a tie, so no guess.
  const matches = names.filter((name) => name.toLowerCase() === near);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * What follows an unknown name's message: `. Did you mean "<name>"?` with a
 * likely name, or nothing, so a message without one stays as it was.
 */
export function didYouMean(typed: string, names: readonly string[]): string {
  const likely = likelyName(typed, names);
  return likely === undefined ? "" : `. Did you mean "${likely}"?`;
}
