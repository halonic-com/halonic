import { type AllowList, allowFilePath, hasInlineAllow } from "./allow.ts";
import { fileNameOf, fileRules } from "./files.ts";
import { absolutePathRule, findAbsolutePaths } from "./paths.ts";
import { findRuleMatches, fingerprint, isPlaceholder, maskSecret, secretRules } from "./secrets.ts";
import { personalTermRule, type TermMatcher } from "./terms.ts";

/**
 * The scanner: runs every leak rule over a change and returns findings
 * that are safe to print. A finding never holds a personal term, a path
 * part with a term in it, a secret, or the rest of an absolute path.
 */

/** A line added by a change, with its line number in the new file. */
export interface AddedLine {
  readonly number: number;
  readonly text: string;
}

/** A file a change adds or modifies, with only the lines it adds. */
export interface ChangedFile {
  readonly path: string;
  readonly lines: readonly AddedLine[];
}

/** Text that belongs to a change but not to a file, such as a commit message. */
export interface ChangeText {
  /** Where the text is, as printed: `commit message`, `pull request title`. */
  readonly label: string;
  readonly text: string;
  /** Names and email addresses are only checked for personal terms. */
  readonly termsOnly: boolean;
}

/** One change to scan: the staged changes, one commit, or the working tree. */
export interface Change {
  /** The commit's short hash, when the change is a commit. */
  readonly commit: string | undefined;
  readonly files: readonly ChangedFile[];
  readonly texts: readonly ChangeText[];
}

/** Where a finding is. `file` may also be a label such as `commit message`. */
export interface Location {
  readonly commit: string | undefined;
  readonly file: string;
  readonly line: number | undefined;
}

/** A finding, already safe to print. */
export interface Finding extends Location {
  readonly rule: string;
  readonly message: string;
}

/** What the rules need besides the change itself. */
export interface ScanSettings {
  readonly terms: TermMatcher;
  readonly allowList: AllowList;
}

const termMessage = "Contains a personal term. Remove or reword it; the term is never shown.";

function findSecrets(text: string, at: Location, settings: ScanSettings): Finding[] {
  const findings: Finding[] = [];
  for (const rule of secretRules) {
    for (const value of findRuleMatches(rule, text)) {
      const print = fingerprint(value);
      if (isPlaceholder(value) || settings.allowList.allows(rule.name, at.file, print)) {
        continue;
      }
      // A key block's header is not secret; for anything else only a masked form is shown.
      const shown =
        rule.name === "private-key" ? "" : ` (${maskSecret(rule.name, value)}, ${print})`;
      findings.push({
        ...at,
        rule: rule.name,
        message: `Contains ${rule.label}${shown}. Remove it, and rotate it if it is real.`,
      });
    }
  }
  return findings;
}

function findPaths(text: string, at: Location, settings: ScanSettings): Finding[] {
  if (hasInlineAllow(text) || settings.allowList.allows(absolutePathRule, at.file)) {
    return [];
  }
  return findAbsolutePaths(text).map((root) => ({
    ...at,
    rule: absolutePathRule,
    message: `Contains an absolute local path under ${root}. Use a repo-relative path or a placeholder.`,
  }));
}

/**
 * Runs one line through the term, secret and path rules.
 *
 * @param at - where the line is, with the real file path (the allow-list needs it)
 */
function scanLine(
  text: string,
  at: Location,
  settings: ScanSettings,
  termsOnly: boolean,
): Finding[] {
  const findings: Finding[] = [];
  if (settings.terms.matches(text)) {
    findings.push({ ...at, rule: personalTermRule, message: termMessage });
  }
  if (!termsOnly) {
    findings.push(...findSecrets(text, at, settings), ...findPaths(text, at, settings));
  }
  return findings;
}

/** Runs one changed file through the file-name rules and each added line. */
function scanFile(
  file: ChangedFile,
  commit: string | undefined,
  settings: ScanSettings,
): Finding[] {
  // A path that contains a term would leak it, so its matching parts are withheld.
  const shownPath = settings.terms.redactPath(file.path);
  const findings: Finding[] = [];
  const atFile: Location = { commit, file: shownPath, line: undefined };
  if (shownPath !== file.path) {
    findings.push({ ...atFile, rule: personalTermRule, message: `The file name ${termMessage}` });
  }
  for (const rule of fileRules) {
    if (rule.matches(fileNameOf(file.path)) && !settings.allowList.allows(rule.name, file.path)) {
      findings.push({
        ...atFile,
        rule: rule.name,
        message: `Is ${rule.label}, which must never be committed. Remove it from the commit.`,
      });
    }
  }
  for (const line of file.lines) {
    const at: Location = { commit, file: file.path, line: line.number };
    for (const finding of scanLine(line.text, at, settings, false)) {
      findings.push({ ...finding, file: shownPath });
    }
  }
  return findings;
}

/** Runs every rule over the changes, plus a check of the allow file itself. */
export function scanChanges(changes: readonly Change[], settings: ScanSettings): Finding[] {
  const findings: Finding[] = settings.allowList.problems.map((problem) => ({
    rule: "allow-list",
    commit: undefined,
    file: allowFilePath,
    line: problem.line,
    message: problem.message,
  }));
  for (const change of changes) {
    for (const file of change.files) {
      findings.push(...scanFile(file, change.commit, settings));
    }
    for (const { label, text, termsOnly } of change.texts) {
      const at: Location = { commit: change.commit, file: label, line: undefined };
      for (const line of text.split("\n")) {
        findings.push(...scanLine(line, at, settings, termsOnly));
      }
    }
  }
  return findings;
}
