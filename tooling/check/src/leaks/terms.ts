import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The personal-terms rule. The list of protected terms never
 * enters the repo: CI reads it from an encrypted secret, and each person
 * keeps a local copy outside the repo. Nothing here ever prints a term.
 */

/** The rule name, as used in reports. It can't be allow-listed. */
export const personalTermRule = "personal-term";

/** Set to `true` in CI once the secret must exist: a missing list then fails instead of skipping. */
export const termsRequiredVariable = "HALONIC_TERMS_REQUIRED";

/** The environment variable CI fills from the encrypted Actions secret. */
export const termsEnvironmentVariable = "HALONIC_DENY_TERMS";

/** Points at a local terms file somewhere other than the default. */
export const termsFileEnvironmentVariable = "HALONIC_DENY_TERMS_FILE";

/** The default local copy of the list, outside the repo. */
export const defaultTermsFile = join(homedir(), ".config", "halonic", "deny-terms");

/** Anything that isn't a letter or a digit: spaces, dots, dashes, underscores. */
const separator = String.raw`[^\p{L}\p{N}]`;

/**
 * Makes look-alike spellings equal before matching: percent escapes are
 * decoded (`blue%20whale`), compatibility forms are folded (full-width
 * letters, ligatures), invisible format characters are dropped (zero-width
 * spaces) and accents are removed.
 */
export function normalise(text: string): string {
  const decoded = text.replace(/(?:%[0-9a-f]{2})+/gi, (escapes) => {
    try {
      return decodeURIComponent(escapes);
    } catch {
      return " ";
    }
  });
  return decoded
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Letters and digits only, lowercase: `Jane.Doe` → `janedoe`. */
function squash(text: string): string {
  return normalise(text).toLowerCase().replace(new RegExp(separator, "gu"), "");
}

/**
 * Turns a term into a pattern that finds it anywhere, in any case, also
 * inside longer words and identifiers. The words of a multi-word term may
 * be joined by any separator or none: `Jane Doe` matches `jane.doe`,
 * `JANE_DOE` and `janedoe`.
 */
function termPattern(term: string): RegExp | undefined {
  const words = normalise(term)
    .split(new RegExp(`${separator}+`, "u"))
    .filter((word) => word !== "");
  if (words.length === 0) {
    return undefined;
  }
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join(`${separator}*`), "giu");
}

/**
 * An allowed phrase needs at least this many letters and digits. A short
 * phrase would sit inside many terms and could hide them.
 */
export const minimumPhraseLength = 8;

/** Where a pattern matches in a text, from `start` up to (not including) `end`. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * Every place the pattern matches, overlapping ones included, so one match
 * can't hide the next. The pattern must have the `g` flag.
 */
function spansOf(pattern: RegExp, text: string): Span[] {
  const spans: Span[] = [];
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    spans.push({ start: match.index, end: match.index + match[0].length });
    pattern.lastIndex = match.index + 1;
  }
  return spans;
}

/** Matches text against the protected terms. */
export class TermMatcher {
  private readonly patterns: readonly RegExp[];
  private readonly allowedPhrases: readonly RegExp[];

  /**
   * @param terms - the protected terms, one per entry
   * @param allowedPhrases - harmless technical phrases that contain a term
   *   (such as CSS `font-family`). A term found entirely inside one of them
   *   is not reported; a term anywhere else in the same text still is. A
   *   phrase that is only a term itself, or shorter than
   *   {@link minimumPhraseLength}, is ignored, so the phrase list can never
   *   silence a bare term.
   */
  constructor(terms: readonly string[], allowedPhrases: readonly string[] = []) {
    const patterns = terms.map(termPattern).filter((pattern) => pattern !== undefined);
    const squashedTerms = new Set(terms.map(squash));
    this.patterns = patterns;
    this.allowedPhrases = allowedPhrases
      .filter((phrase) => squash(phrase).length >= minimumPhraseLength)
      .filter((phrase) => !squashedTerms.has(squash(phrase)))
      .map((phrase) => new RegExp(normalise(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"));
  }

  /** How many terms are loaded. Shown in the summary to confirm the list; never the terms. */
  get size(): number {
    return this.patterns.length;
  }

  /** True when there are no terms, which means the list isn't configured. */
  get isEmpty(): boolean {
    return this.patterns.length === 0;
  }

  /** True when the text contains a protected term outside every allowed phrase. */
  matches(text: string): boolean {
    const normalised = normalise(text);
    const allowed = this.allowedPhrases.flatMap((phrase) => spansOf(phrase, normalised));
    const insideAllowed = (term: Span): boolean =>
      allowed.some((phrase) => phrase.start <= term.start && term.end <= phrase.end);
    return this.patterns.some((pattern) =>
      spansOf(pattern, normalised).some((term) => !insideAllowed(term)),
    );
  }

  /**
   * Replaces each part of a path that contains a protected term with
   * `[withheld]`, so the path can be printed without showing the term.
   * A multi-word term can also be split across folders
   * (`docs/<first>/<last>.md`); then no single part matches, and the whole
   * path is withheld.
   */
  redactPath(path: string): string {
    const parts = path.split("/").map((part) => (this.matches(part) ? "[withheld]" : part));
    const redacted = parts.join("/");
    return this.matches(redacted) ? "[withheld]" : redacted;
  }
}

/** Parses a list: one term per line (or comma-separated); `#` starts a comment. */
export function parseTermList(text: string): string[] {
  return text
    .split(/[\r\n,]/)
    .map((entry) => entry.replace(/#.*$/, "").trim())
    .filter((entry) => entry !== "");
}

/** Where the terms came from, for the summary line. Never the terms. */
export type TermsSource = "secret" | "file" | "none";

/**
 * Loads the protected terms: from the environment variable (CI) when it is
 * set, otherwise from the local file. A secret or file that holds only
 * comments and blank lines counts as missing, so it can't pass for a
 * configured list while checking nothing.
 */
export function loadTerms(environment: NodeJS.ProcessEnv = process.env): {
  terms: string[];
  source: TermsSource;
} {
  const fromEnvironment = parseTermList(environment[termsEnvironmentVariable] ?? "");
  if (fromEnvironment.length > 0) {
    return { terms: fromEnvironment, source: "secret" };
  }
  const file = environment[termsFileEnvironmentVariable] || defaultTermsFile;
  const fromFile = existsSync(file) ? parseTermList(readFileSync(file, "utf8")) : [];
  if (fromFile.length > 0) {
    return { terms: fromFile, source: "file" };
  }
  return { terms: [], source: "none" };
}

/** The in-repo list of harmless technical phrases, relative to the repo root. */
export const allowedPhrasesFile = "tooling/check/terms-allowed-phrases.txt";

/** Reads a list of harmless technical phrases (never terms); a missing file is an empty list. */
export function loadAllowedPhrases(path: string): string[] {
  return existsSync(path) ? parseTermList(readFileSync(path, "utf8")) : [];
}
