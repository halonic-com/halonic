import ts from "@typescript/typescript6";
import type { CheckContext } from "../lib/context.ts";
import { isSourceFile, isTestFile } from "../lib/source-files.ts";
import type { WorkspacePackage } from "../lib/workspace.ts";
import type { Checkouts, GuardFinding } from "./finding.ts";
import { isWatched } from "./skips.ts";
import { readTestFileFacts } from "./test-file-facts.ts";

/**
 * A comment that tells the coverage tool to leave code out, such as
 * `/* v8 ignore next *\/`. The directive opens the comment; a comment that
 * only mentions one doesn't count.
 */
const ignoreDirective = /^\/[/*]\s*(?:v8|c8|istanbul)\s+ignore\b/;

/**
 * Plan 9.3, point 3: coverage may not be loosened without a note:
 * - a lower coverage floor in a package's `"halonic": { "coverage": … }`
 * - new coverage-ignore comments (`v8 ignore`, `c8 ignore`, `istanbul ignore`)
 * - changed `coverage` settings in a Vitest config or the shared preset
 */
export function checkCoverage(checkouts: Checkouts): GuardFinding[] {
  return [
    ...lowerFloors(checkouts),
    ...newIgnoreComments(checkouts),
    ...changedSettings(checkouts),
  ];
}

function lowerFloors({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  for (const before of base.packages) {
    const after = head.packages.find((pkg) => pkg.directory === before.directory);
    if (after === undefined) {
      continue;
    }
    const floorAfter = floorOf(after);
    for (const [metric, was] of Object.entries(floorOf(before))) {
      const now = floorAfter[metric];
      if (now === undefined || now < was) {
        findings.push({
          subject: after.manifestPath,
          file: after.manifestPath,
          message: `The coverage floor for ${metric} in ${after.manifestPath} went from ${was} to ${now ?? "nothing"}.`,
        });
      }
    }
  }
  return findings;
}

/** The numbers in a package's `"halonic": { "coverage": { … } }`. */
function floorOf(pkg: WorkspacePackage): Record<string, number> {
  const halonic: unknown = pkg.manifest.halonic;
  const coverage =
    typeof halonic === "object" && halonic !== null
      ? (halonic as Record<string, unknown>)["coverage"]
      : undefined;
  if (typeof coverage !== "object" || coverage === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(coverage).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function newIgnoreComments({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  for (const file of head.files.filter(isSourceFile)) {
    const inBase = base.files.includes(file);
    if (inBase && base.read(file) === head.read(file)) {
      continue;
    }
    const after = ignoreComments(head, file);
    const was = inBase ? ignoreComments(base, file).length : 0;
    if (after.length > was) {
      findings.push({
        subject: file,
        file,
        ...(after[0] === undefined ? {} : { line: after[0] }),
        message: `${file} adds a coverage-ignore comment (${after.length} now, ${was} on the merge base).`,
      });
    }
  }
  return findings;
}

/** The lines of the coverage-ignore comments in a file, read with the TypeScript scanner. */
function ignoreComments(context: CheckContext, file: string): number[] {
  const text = context.read(file);
  if (!/(?:v8|c8|istanbul)\s+ignore/.test(text)) {
    return [];
  }
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  const lines: number[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const isComment =
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia;
    if (isComment && ignoreDirective.test(scanner.getTokenText())) {
      lines.push(text.slice(0, scanner.getTokenStart()).split("\n").length);
    }
  }
  return lines;
}

function changedSettings({ base, head }: Checkouts): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const isConfig = (file: string): boolean => isWatched(file) && !isTestFile(file);
  const configs = new Set([...base.files, ...head.files].filter(isConfig));
  for (const file of [...configs].sort()) {
    const before = coverageSettings(base, file);
    const after = coverageSettings(head, file);
    if (before.join("\0") !== after.join("\0")) {
      findings.push({
        subject: file,
        file,
        message: `${file} changes the coverage settings.`,
      });
    }
  }
  return findings;
}

function coverageSettings(context: CheckContext, file: string): readonly string[] {
  return context.files.includes(file)
    ? readTestFileFacts(file, context.read(file)).coverageSettings
    : [];
}
