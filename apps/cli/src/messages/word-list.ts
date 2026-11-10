/**
 * Words as a sentence lists them: commas, with "and" or "or" before the last
 * (cli-output 3.4, revision 25).
 *
 * @example
 * wordList(["approve", "reject"], "or"); // "approve or reject"
 * wordList(["a.md", "b.md", "c.md"], "and"); // "a.md, b.md and c.md"
 */
export function wordList(words: readonly string[], last: "and" | "or"): string {
  if (words.length <= 1) {
    return words.join("");
  }
  return `${words.slice(0, -1).join(", ")} ${last} ${words.at(-1)}`;
}
