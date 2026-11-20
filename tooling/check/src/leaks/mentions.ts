import { readFileSync } from "node:fs";

/**
 * Agent mentions. Our agents are not GitHub users: `@` and an agent's name
 * in a pull request or a commit message notifies whoever owns that GitHub
 * username, a stranger to the project (HAL-14420). The text names the
 * agent without the `@`, or in backticks. The names are no secret, so a
 * finding shows the mention.
 */

/** The rule name, as used in reports. It can't be allow-listed. */
export const agentMentionRule = "agent-mention";

/**
 * The list of agent names, one per line, next to the guard's own code. CI
 * runs a pull request against its base's guard, so it also reads the
 * base's list and a pull request can't shorten it.
 */
export const agentNamesFile = new URL("../../agent-names.txt", import.meta.url);

/** The texts GitHub shows on a pull request or a commit, where a mention notifies someone. */
export const mentionLabels: ReadonlySet<string> = new Set([
  "commit message",
  "pull request title",
  "pull request body",
]);

/** The names in a list file: one per line, `#` comments and blank lines skipped. */
export function parseAgentNames(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Reads the repo's list of agent names. */
export function loadAgentNames(file: URL = agentNamesFile): string[] {
  return parseAgentNames(readFileSync(file, "utf8"));
}

/** Finds `@<agent name>` in a text, in any case. */
export class MentionMatcher {
  readonly #pattern: RegExp | undefined;

  constructor(names: readonly string[]) {
    const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Not inside an email address or a longer word before the `@`
    // (`julian@example.com`, `a@julian`), and not the start of a longer
    // username after it (`@julian-x`). A dot or an underscore after the
    // name ends a GitHub username, so `@julian.` still notifies.
    this.#pattern =
      escaped.length === 0
        ? undefined
        : new RegExp(
            String.raw`(?<![\p{L}\p{N}_.+\-])@(?:${escaped.join("|")})(?![\p{L}\p{N}\-])`,
            "giu",
          );
  }

  /** The mentions in the text, as written. */
  find(text: string): string[] {
    return this.#pattern === undefined ? [] : [...text.matchAll(this.#pattern)].map(([m]) => m);
  }
}
