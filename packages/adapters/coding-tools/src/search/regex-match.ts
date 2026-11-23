// A regular expression the model wrote can take forever on one line, such
// as `(a+)+$` on a long run of `a`s. JavaScript can't stop a running match
// from outside, but V8 stops a script run with `vm`'s time limit even in
// the middle of one. So the match runs as a fixed script in an empty
// context; the expression is only data to it, and the script loads nothing.

import { createContext, Script } from "node:vm";

/** The script that finds the matching lines; its values come from the context. */
const findLines = new Script(`(() => {
  const found = [];
  for (let index = 0; index < lines.length && found.length < limit; index += 1) {
    if (expression.test(lines[index])) found.push(index);
  }
  return found;
})()`);

/** A match that ran past its time limit. */
export class MatchTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The regular expression took longer than ${timeoutMs} ms.`);
    this.name = "MatchTimeoutError";
  }
}

/**
 * Finds the lines a regular expression matches, with a time limit for each
 * call (requirement `coding-tools.search`). One matcher serves one search,
 * and reuses its context for every file.
 */
export class TimedLineMatcher {
  readonly #context = createContext({});

  /**
   * The indexes of the first `limit` lines `expression` matches.
   *
   * @param expression - without the `g` or `y` flag, so a match doesn't depend on the one before
   * @throws {MatchTimeoutError} when the matching takes longer than `timeoutMs`
   */
  matchingLines(
    lines: readonly string[],
    expression: RegExp,
    limit: number,
    timeoutMs: number,
  ): number[] {
    Object.assign(this.#context, { lines, expression, limit });
    try {
      const found: unknown = findLines.runInContext(this.#context, { timeout: timeoutMs });
      return Array.isArray(found) ? found.map(Number) : [];
    } catch (error) {
      if (isTimeout(error)) throw new MatchTimeoutError(timeoutMs);
      throw error;
    } finally {
      Object.assign(this.#context, { lines: [], expression: null, limit: 0 });
    }
  }
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT"
  );
}
