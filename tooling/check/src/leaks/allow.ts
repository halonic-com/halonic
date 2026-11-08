import { fileRules } from "./files.ts";
import { absolutePathRule } from "./paths.ts";
import { secretRules } from "./secrets.ts";
import { personalTermRule } from "./terms.ts";

/**
 * The allow-list for genuine false positives. There are two ways in, and
 * each one is narrow on purpose:
 *
 * - An inline marker, `leak-guard: allow absolute-path <reason>`, on the
 *   line itself. It only works for absolute paths, the common false
 *   positive (a doc that explains where an OS keeps its files).
 * - The allow file, `tooling/check/leak-allow.txt`, which needs review
 *   from its code owner. A secret-shaped value is allowed by its
 *   fingerprint, so an entry allows that one value and never a real key
 *   added next to it later.
 *
 * Personal terms can't be allowed at all: reword the text instead.
 */

/** Where the allow file lives, relative to the repo root. */
export const allowFilePath = "tooling/check/leak-allow.txt";

const inlineMarker = /leak-guard: allow absolute-path \S+/;

/** True when the line carries the inline marker, which allows an absolute path. */
export function hasInlineAllow(line: string): boolean {
  return inlineMarker.test(line);
}

/** One entry of the allow file. */
interface AllowEntry {
  readonly rule: string;
  readonly file: RegExp;
  readonly fingerprint: string | undefined;
}

/** A mistake in the allow file, reported as a finding on that file. */
export interface AllowFileProblem {
  readonly line: number;
  readonly message: string;
}

const secretRuleNames = new Set(secretRules.map((rule) => rule.name));
const otherRuleNames = new Set([absolutePathRule, ...fileRules.map((rule) => rule.name)]);

/** File rules allow one named file at a time: a glob could let any `.env` or key file in. */
const exactFileRuleNames = new Set(fileRules.map((rule) => rule.name));

/**
 * Turns a path glob into a pattern: `*` matches within one folder, `**`
 * across folders. Anything else matches itself.
 */
function globPattern(glob: string): RegExp {
  const source = glob
    .split(/(\*\*\/?|\*)/)
    .map((part) => {
      if (part === "**" || part === "**/") {
        return ".*";
      }
      if (part === "*") {
        return "[^/]*";
      }
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`);
}

/**
 * Reads one line of the allow file:
 *
 *   <rule> <file or glob> [fp:<fingerprint>] <reason …>
 *
 * @returns the entry, or a message saying what is wrong with the line
 */
function parseEntry(text: string): AllowEntry | string {
  const [rule = "", file = "", ...rest] = text.split(/\s+/);
  const fingerprint = rest[0]?.startsWith("fp:") ? rest.shift() : undefined;
  const reason = rest.join(" ");
  if (rule === personalTermRule) {
    return "Personal terms can't be allowed. Reword the text instead.";
  }
  if (!secretRuleNames.has(rule) && !otherRuleNames.has(rule)) {
    return `Unknown rule "${rule}".`;
  }
  if (file === "") {
    return "Name the file (or a glob) the entry applies to.";
  }
  if (file.split("/")[0]?.includes("*")) {
    return "Name the top folder or file: an entry can't start with a glob, which could match the whole repo.";
  }
  if (exactFileRuleNames.has(rule) && file.includes("*")) {
    return `A ${rule} entry needs the exact file path, not a glob.`;
  }
  if (secretRuleNames.has(rule) && fingerprint === undefined) {
    return "A secret rule needs the fingerprint the leak guard printed (fp:…).";
  }
  if (!secretRuleNames.has(rule) && fingerprint !== undefined) {
    return "Only secret rules take a fingerprint.";
  }
  if (reason.split(" ").length < 2) {
    return "Give a reason of a few words.";
  }
  return { rule, file: globPattern(file), fingerprint };
}

/** The checked-in allow file, read once per run. */
export class AllowList {
  private readonly entries: readonly AllowEntry[];
  /** Lines of the allow file that are wrong; each one fails the check. */
  readonly problems: readonly AllowFileProblem[];

  constructor(text: string) {
    const entries: AllowEntry[] = [];
    const problems: AllowFileProblem[] = [];
    text.split("\n").forEach((raw, index) => {
      const line = raw.replace(/#.*$/, "").trim();
      if (line === "") {
        return;
      }
      const entry = parseEntry(line);
      if (typeof entry === "string") {
        problems.push({ line: index + 1, message: entry });
      } else {
        entries.push(entry);
      }
    });
    this.entries = entries;
    this.problems = problems;
  }

  /**
   * True when an entry allows this finding.
   *
   * @param fingerprint - for secret rules, the fingerprint of the matched value
   */
  allows(rule: string, file: string, fingerprint?: string): boolean {
    return this.entries.some(
      (entry) =>
        entry.rule === rule &&
        entry.file.test(file) &&
        (entry.fingerprint === undefined || entry.fingerprint === fingerprint),
    );
  }
}
