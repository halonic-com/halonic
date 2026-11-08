import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AllowList, allowFilePath } from "../leaks/allow.ts";
import { commitChanges, git, stagedChanges, treeChanges } from "../leaks/git-changes.ts";
import { pushedRevisions } from "../leaks/push.ts";
import type { Change, ChangeText, Finding } from "../leaks/scan.ts";
import { scanChanges } from "../leaks/scan.ts";
import {
  allowedPhrasesFile,
  loadAllowedPhrases,
  loadTerms,
  TermMatcher,
  termsEnvironmentVariable,
  termsFileEnvironmentVariable,
  termsRequiredVariable,
} from "../leaks/terms.ts";
import { formatAnnotation } from "../lib/problems.ts";
import { readPullRequestText } from "../lib/pull-request.ts";

/**
 * The leak guard: secrets and keys, private key blocks, `.env` and key
 * files, absolute local paths and personal terms. The git
 * hooks, `pnpm verify` and CI all run these same rules.
 *
 *   pnpm check:leaks                    every tracked file in the working tree
 *   pnpm check:leaks --staged           what the next commit adds (pre-commit hook)
 *   pnpm check:leaks --push <remote>    the commits a push sends, refs on stdin (pre-push hook)
 *   pnpm check:leaks --range A..B       the commits of a pull request, plus its branch,
 *                                       title and body from $GITHUB_EVENT_PATH (CI)
 *   pnpm check:leaks --all              the working tree and every commit on every ref
 *
 * --allowed-phrases FILE and --allow-file FILE read those two lists from FILE
 * instead of the repo's copy. CI points them at the base commit's copies, so
 * a pull request can't weaken the guard it is checked by.
 *
 * Only our own code and Node's built-ins run here, never a dependency, so
 * CI can hand it the personal-terms secret without installing anything.
 * It prints where a problem is, never a term, a secret or a full path.
 */

const docs = "docs/guides/leak-guard.md";

/**
 * The pull request's own text. It comes from the event file, not from `env:`,
 * because GitHub prints a step's `env:` block in the public job log.
 */
function pullRequestTexts(): ChangeText[] {
  const pullRequest = readPullRequestText();
  const fields: [string, string | undefined][] = [
    ["branch name", pullRequest?.branch],
    ["pull request title", pullRequest?.title],
    ["pull request body", pullRequest?.body],
  ];
  return fields
    .filter((field): field is [string, string] => field[1] !== undefined && field[1] !== "")
    .map(([label, text]) => ({ label, text, termsOnly: false }));
}

/** The options that take a file name, with the file names given. */
interface Options {
  readonly allowedPhrasesFile: string | undefined;
  readonly allowFile: string | undefined;
  /** What is left: the mode and its value. */
  readonly rest: readonly string[];
}

function parseOptions(argv: readonly string[]): Options {
  const rest: string[] = [];
  const files = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--allowed-phrases" || argument === "--allow-file") {
      files.set(argument, argv[index + 1] ?? "");
      index += 1;
    } else {
      rest.push(argument);
    }
  }
  return {
    allowedPhrasesFile: files.get("--allowed-phrases"),
    allowFile: files.get("--allow-file"),
    rest,
  };
}

/** Picks the changes to scan from the arguments; undefined when they are wrong. */
function selectChanges(root: string, argv: readonly string[]): Change[] | undefined {
  const [mode, value = ""] = argv;
  switch (mode) {
    case undefined:
      return treeChanges(root);
    case "--staged":
      return stagedChanges(root);
    case "--push":
      return pushedRevisions(root, readFileSync(0, "utf8"), value).flatMap((revisions) =>
        commitChanges(root, revisions),
      );
    case "--range":
      if (!/^[\w./-]+\.\.[\w./-]+$/.test(value)) {
        return undefined;
      }
      return [
        ...commitChanges(root, [value]),
        { commit: undefined, files: [], texts: pullRequestTexts() },
      ];
    case "--all":
      return [...treeChanges(root), ...commitChanges(root, ["--all"])];
    default:
      return undefined;
  }
}

function formatFinding(finding: Finding): string {
  const commit = finding.commit === undefined ? "" : `commit ${finding.commit}, `;
  if (process.env["GITHUB_ACTIONS"]) {
    const { rule, file, line, message } = finding;
    const problem = { rule, severity: "error" as const, file, message: `${commit}${message}` };
    return formatAnnotation(line === undefined ? problem : { ...problem, line });
  }
  const line = finding.line === undefined ? "" : `:${finding.line}`;
  return `  ${commit}${finding.file}${line} [${finding.rule}] ${finding.message}`;
}

/** Says why the personal terms were not checked. Never the terms. */
function termsNotice(inCi: boolean): string {
  return inCi
    ? `The ${termsEnvironmentVariable} secret is not set, so personal terms were not checked.`
    : `No deny-terms file at ~/.config/halonic/deny-terms (or ${termsFileEnvironmentVariable}), so personal terms were not checked; see ${docs}`;
}

/**
 * Asks GitHub to hide every term in the job log. The secret is masked as a
 * whole, but not the single entries of a multi-line list.
 */
function maskTerms(terms: readonly string[]): void {
  for (const term of terms) {
    console.log(`::add-mask::${term.replace(/%/g, "%25")}`);
  }
}

/**
 * Builds the term matcher, or says why it can't be built and returns
 * undefined. Every message here is safe to print: it names a phrase by its
 * number, never by its text.
 */
function buildMatcher(
  root: string,
  options: Options,
  terms: readonly string[],
  source: string,
): TermMatcher | undefined {
  let matcher: TermMatcher;
  try {
    const phrasesPath = options.allowedPhrasesFile ?? join(root, allowedPhrasesFile);
    matcher = new TermMatcher(terms, loadAllowedPhrases(phrasesPath));
  } catch (error) {
    console.error(
      `leak guard: FAILED. ${error instanceof Error ? error.message : "Bad phrase list."}`,
    );
    return undefined;
  }
  if (source !== "none" && matcher.isEmpty) {
    // A list that is set but holds nothing usable is a broken secret, not a
    // missing one: failing is the only way anyone notices.
    console.error(`leak guard: FAILED. The personal terms from ${source} hold no usable term.`);
    return undefined;
  }
  return matcher;
}

function main(argv: readonly string[]): number {
  const options = parseOptions(argv);
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const changes = selectChanges(root, options.rest);
  if (changes === undefined) {
    console.error(
      "Usage: check:leaks [--staged | --push <remote> | --range BASE..HEAD | --all] [--allowed-phrases FILE] [--allow-file FILE]",
    );
    return 2;
  }
  const inCi = Boolean(process.env["GITHUB_ACTIONS"]);
  const { terms, source } = loadTerms();
  if (inCi) {
    maskTerms(terms);
  }
  const matcher = buildMatcher(root, options, terms, source);
  if (matcher === undefined) {
    return 1;
  }
  const allowPath = options.allowFile ?? join(root, allowFilePath);
  const allowList = new AllowList(existsSync(allowPath) ? readFileSync(allowPath, "utf8") : "");
  const findings = scanChanges(changes, { terms: matcher, allowList });
  // Until the secret exists CI skips the terms with a warning, so work can
  // start. Once HALONIC_TERMS_REQUIRED is true a missing list fails.
  const termsRequiredButMissing =
    source === "none" && process.env[termsRequiredVariable] === "true";
  if (source === "none") {
    const notice = termsNotice(inCi);
    console.log(inCi ? `::warning title=leak guard::${notice}` : `leak guard: ${notice}.`);
  }
  if (findings.length === 0 && !termsRequiredButMissing) {
    console.log(`leak guard: clean (${source === "none" ? "without" : "with"} personal terms).`);
    return 0;
  }
  if (findings.length > 0) {
    console.log(`leak guard: ${findings.length} problem(s) found.`);
    for (const finding of findings) {
      console.log(formatFinding(finding));
    }
    console.log(`\nHow to fix or allow a false positive: ${docs}`);
  }
  if (termsRequiredButMissing) {
    console.log(
      `leak guard: failed. ${termsRequiredVariable} is true but the ${termsEnvironmentVariable} secret is not available, so personal terms were not checked.`,
    );
  }
  return 1;
}

process.exitCode = main(process.argv.slice(2));
