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

/** The environment variable CI fills from the encrypted Actions secret. */
export const termsEnvironmentVariable = "HALONIC_DENY_TERMS";

/** Points at a local terms file somewhere other than the default. */
export const termsFileEnvironmentVariable = "HALONIC_DENY_TERMS_FILE";

/** The default local copy of the list, outside the repo. */
export const defaultTermsFile = join(homedir(), ".config", "halonic", "deny-terms");

/** Anything that isn't a letter or a digit: spaces, dots, dashes, underscores. */
const separator = String.raw`[^\p{L}\p{N}]`;

/** Letters and digits only, lowercase: `Jane.Doe` → `janedoe`. */
function squash(text: string): string {
  return text.toLowerCase().replace(new RegExp(separator, "gu"), "");
}

/**
 * Turns a term into a pattern that finds it anywhere, in any case, also
 * inside longer words and identifiers. The words of a multi-word term may
 * be joined by any separator or none: `Jane Doe` matches `jane.doe`,
 * `JANE_DOE` and `janedoe`.
 */
function termPattern(term: string): RegExp | undefined {
  const words = term.split(new RegExp(`${separator}+`, "u")).filter((word) => word !== "");
  if (words.length === 0) {
    return undefined;
  }
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(escaped.join(`${separator}*`), "iu");
}

/** Matches text against the protected terms. */
export class TermMatcher {
  private readonly patterns: readonly RegExp[];
  private readonly allowedPhrases: readonly RegExp[];

  /**
   * @param terms - the protected terms, one per entry
   * @param allowedPhrases - harmless technical phrases that contain a term
   *   (such as CSS `font-family`); they are removed before matching. A
   *   phrase that is only a term itself is ignored, so the phrase list can
   *   never silence a bare term.
   */
  constructor(terms: readonly string[], allowedPhrases: readonly string[] = []) {
    const patterns = terms.map(termPattern).filter((pattern) => pattern !== undefined);
    const squashedTerms = new Set(terms.map(squash));
    this.patterns = patterns;
    this.allowedPhrases = allowedPhrases
      .filter((phrase) => phrase.trim() !== "" && !squashedTerms.has(squash(phrase)))
      .map((phrase) => new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"));
  }

  /** True when there are no terms, which means the list isn't configured. */
  get isEmpty(): boolean {
    return this.patterns.length === 0;
  }

  /** True when the text contains any protected term. */
  matches(text: string): boolean {
    let rest = text;
    for (const phrase of this.allowedPhrases) {
      rest = rest.replace(phrase, " ");
    }
    return this.patterns.some((pattern) => pattern.test(rest));
  }

  /**
   * Replaces each part of a path that contains a protected term with
   * `[withheld]`, so the path can be printed without showing the term.
   */
  redactPath(path: string): string {
    return path
      .split("/")
      .map((part) => (this.matches(part) ? "[withheld]" : part))
      .join("/");
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
 * set, otherwise from the local file.
 */
export function loadTerms(environment: NodeJS.ProcessEnv = process.env): {
  terms: string[];
  source: TermsSource;
} {
  const fromEnvironment = environment[termsEnvironmentVariable];
  if (fromEnvironment !== undefined && fromEnvironment.trim() !== "") {
    return { terms: parseTermList(fromEnvironment), source: "secret" };
  }
  const file = environment[termsFileEnvironmentVariable] || defaultTermsFile;
  if (existsSync(file)) {
    return { terms: parseTermList(readFileSync(file, "utf8")), source: "file" };
  }
  return { terms: [], source: "none" };
}

/** Reads the in-repo list of harmless technical phrases (never terms). */
export function loadAllowedPhrases(root: string): string[] {
  const path = join(root, "tooling", "check", "terms-allowed-phrases.txt");
  return existsSync(path) ? parseTermList(readFileSync(path, "utf8")) : [];
}
