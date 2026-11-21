import { nearMatch as stdNearMatch } from "@halonicjs/std";

/**
 * The one command or option within an edit distance of 2 of `typed`, for
 * "Did you mean", from std's `nearMatch`. When none is that close, or two or
 * more are, there's no guess. Only for commands and options, never for a file
 * or workflow name the user may have typed on purpose.
 *
 * @example
 * nearMatch("tset", ["init", "test", "trust"]); // "test"
 * nearMatch("xyz", ["init", "test"]); // undefined
 */
export function nearMatch(typed: string, candidates: readonly string[]): string | undefined {
  return stdNearMatch(typed, candidates, { spellingsOf: optionStem });
}

/**
 * For a `--no-x` option, its stem `--x`, so the design's "--colour" finds
 * "--no-color": the typo is one edit from the stem, four from the option.
 */
function optionStem(candidate: string): string[] {
  return candidate.startsWith("--no-") ? [`--${candidate.slice("--no-".length)}`] : [];
}
