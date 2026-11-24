/**
 * History cutoffs for terms added to the deny-terms list later. A term
 * added today may sit in commits from before, which can't be reworded any
 * more. A cutoff entry in the allow file lets the full history scan
 * (`--all`) pass that one term in commits committed before a date, while
 * every other term, and the same term in any later commit, still fails.
 * Every other scan (hooks, pull requests, the merge queue, pushes to
 * `main`) ignores cutoffs.
 *
 * An entry names the term by its position in the list, never by its text
 * or a hash of it: a hash of a short name can be reversed by trying every
 * name.
 *
 *   term-cutoff entry:<n> before:<YYYY-MM-DDTHH:MMZ> <reason …>
 */

/** The first word of a cutoff line in the allow file. */
export const termCutoffKeyword = "term-cutoff";

/** One cutoff: term number `entry` passes in commits committed before `before`. */
export interface TermCutoff {
  /** The term's position in the parsed list, counting from 1. */
  readonly entry: number;
  readonly before: Date;
  /** The allow file's line, for messages. */
  readonly line: number;
}

const isoMinute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/;

/**
 * Reads one cutoff line.
 *
 * @param now - a cutoff can't lie in the future, where it would excuse new commits
 * @returns the cutoff, or a message saying what is wrong with the line
 */
export function parseTermCutoff(text: string, line: number, now: Date): TermCutoff | string {
  const [, entryWord = "", beforeWord = "", ...reason] = text.split(/\s+/);
  const entry = /^entry:([1-9]\d{0,3})$/.exec(entryWord)?.[1];
  if (entry === undefined) {
    return "A term-cutoff needs entry:<n>, the term's position in the list (1 is the first term).";
  }
  const date = /^before:(.+)$/.exec(beforeWord)?.[1] ?? "";
  const before = new Date(date);
  if (!isoMinute.test(date) || Number.isNaN(before.getTime())) {
    return "A term-cutoff needs before:<YYYY-MM-DDTHH:MMZ>, a UTC date and time.";
  }
  if (before.getTime() > now.getTime()) {
    return "A term-cutoff's date can't be in the future: it would excuse new commits.";
  }
  if (reason.length < 2) {
    return "Give a reason of a few words.";
  }
  return { entry: Number(entry), before, line };
}

/**
 * What is wrong when a cutoff names a term the list doesn't have: the list
 * was shortened or reordered, and the cutoff could now excuse an older
 * term. Names terms by number only.
 */
export function cutoffsProblem(
  cutoffs: readonly TermCutoff[],
  termCount: number,
): string | undefined {
  const missing = cutoffs.find((cutoff) => cutoff.entry > termCount);
  if (missing === undefined) {
    return undefined;
  }
  return `line ${missing.line} names term ${missing.entry}, but the list has ${termCount}. Check the list's order before changing the entry.`;
}

/**
 * The terms a commit is excused from, as 0-based positions in the list:
 * those whose cutoff is after the commit's committer date. A change without
 * a date (the working tree, a ref name) is excused from nothing.
 */
export function excusedTerms(
  cutoffs: readonly TermCutoff[],
  committed: string | undefined,
): ReadonlySet<number> {
  const time = committed === undefined ? Number.NaN : new Date(committed).getTime();
  if (Number.isNaN(time)) {
    return new Set();
  }
  return new Set(
    cutoffs.filter((cutoff) => time < cutoff.before.getTime()).map((cutoff) => cutoff.entry - 1),
  );
}
