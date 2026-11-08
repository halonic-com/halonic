import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The personal-terms guard (plan 11.1). The list of protected terms never
 * enters the repo: CI reads it from an encrypted secret, and a person can
 * keep a local copy outside the repo. Nothing here ever prints a term.
 */

/** The environment variable CI fills from the encrypted secret. */
export const termsEnvironmentVariable = "HALONIC_DENY_TERMS";

/** The optional local copy of the list, outside the repo. */
export const localTermsFile = join(homedir(), ".config", "halonic", "deny-terms");

/** Splits text into lowercase words, also inside identifiers: `someNameHelper` → some, name, helper. */
export function words(text: string): string[] {
  const spaced = text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2");
  return spaced
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/**
 * Matches text against the protected terms. A term may be several words;
 * it matches when its words appear in a row. Matching is case-insensitive
 * and works inside identifiers (`some_name`, `someNameHelper`).
 */
export class TermMatcher {
  private readonly terms: readonly (readonly string[])[];
  private readonly allowedPhrases: readonly string[];

  /**
   * @param terms - the protected terms, one per entry
   * @param allowedPhrases - harmless technical phrases that contain a term
   *   (such as CSS `font-family`); they are removed before matching
   */
  constructor(terms: readonly string[], allowedPhrases: readonly string[] = []) {
    this.terms = terms.map(words).filter((term) => term.length > 0);
    this.allowedPhrases = allowedPhrases
      .map((phrase) => phrase.toLowerCase())
      .filter((phrase) => phrase !== "");
  }

  /** True when there are no terms, which means the list isn't configured. */
  get isEmpty(): boolean {
    return this.terms.length === 0;
  }

  /** True when the text contains any protected term. */
  matches(text: string): boolean {
    const tokens = words(stripPhrases(text, this.allowedPhrases));
    return this.terms.some((term) => containsSequence(tokens, term));
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

  /** The 1-based line numbers of the lines that contain a protected term. */
  matchingLines(text: string): number[] {
    const result: number[] = [];
    text.split("\n").forEach((line, index) => {
      if (this.matches(line)) {
        result.push(index + 1);
      }
    });
    return result;
  }
}

function stripPhrases(text: string, phrases: readonly string[]): string {
  let result = text;
  for (const phrase of phrases) {
    const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(pattern, " ");
  }
  return result;
}

function containsSequence(tokens: readonly string[], term: readonly string[]): boolean {
  for (let start = 0; start + term.length <= tokens.length; start += 1) {
    if (term.every((word, offset) => tokens[start + offset] === word)) {
      return true;
    }
  }
  return false;
}

/** Parses a list: one term per line or comma-separated; `#` starts a comment. */
export function parseTermList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((entry) => entry.replace(/#.*$/, "").trim())
    .filter((entry) => entry !== "");
}

/**
 * Loads the protected terms from the environment (CI) or the local file.
 *
 * @returns the terms and where they came from, or an empty list when neither is set
 */
export function loadTerms(environment: NodeJS.ProcessEnv = process.env): {
  terms: string[];
  source: string;
} {
  const fromEnvironment = environment[termsEnvironmentVariable];
  if (fromEnvironment !== undefined && fromEnvironment.trim() !== "") {
    return {
      terms: parseTermList(fromEnvironment),
      source: `the ${termsEnvironmentVariable} secret`,
    };
  }
  if (existsSync(localTermsFile)) {
    return {
      terms: parseTermList(readFileSync(localTermsFile, "utf8")),
      source: "the local deny-terms file",
    };
  }
  return { terms: [], source: "nowhere" };
}

/** Reads the in-repo list of harmless technical phrases (never terms). */
export function loadAllowedPhrases(root: string): string[] {
  const path = join(root, "tooling", "check", "terms-allowed-phrases.txt");
  return existsSync(path) ? parseTermList(readFileSync(path, "utf8")) : [];
}
