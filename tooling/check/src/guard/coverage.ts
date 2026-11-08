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
 * - a lower coverage floor in a package's `"halonic": { "coverage": … }`,
 *   or a floor that goes away with its package
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
    // A moved package keeps its name, so follow it by name too.
    const after =
      head.packages.find((pkg) => pkg.directory === before.directory) ??
      head.packages.find(
        (pkg) => before.manifest.name !== undefined && pkg.manifest.name === before.manifest.name,
      );
    if (after === undefined) {
      findings.push(...deletedFloor(before));
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

/** A deleted package takes its floor with it; a note says that was meant. */
function deletedFloor(pkg: WorkspacePackage): GuardFinding[] {
  const metrics = Object.keys(floorOf(pkg));
  if (metrics.length === 0) {
    return [];
  }
  return [
    {
      subject: pkg.manifestPath,
      file: pkg.manifestPath,
      message: `${pkg.manifestPath} was deleted, and with it the coverage floor for ${metrics.join(", ")}.`,
    },
  ];
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

/**
 * The lines of the coverage-ignore comments in a file, read with the
 * TypeScript parser. The bare scanner has no parser context, so a regex
 * holding a backtick could make it read code as a template, and miss a
 * comment.
 */
function ignoreComments(context: CheckContext, file: string): number[] {
  const text = context.read(file);
  if (!/(?:v8|c8|istanbul)\s+ignore/.test(text)) {
    return [];
  }
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const starts = new Set<number>();
  const record = (pos: number, end: number): void => {
    if (ignoreDirective.test(text.slice(pos, end))) {
      starts.add(pos);
    }
  };
  const visit = (node: ts.Node): void => {
    // A doc comment is a comment already; its parts are not code.
    if ((node.flags & ts.NodeFlags.JSDoc) !== 0) {
      return;
    }
    const children = node.getChildren(source);
    // Comments sit in the trivia before a token. JSX text has none, only text.
    if (children.length === 0 && node.kind !== ts.SyntaxKind.JsxText) {
      ts.forEachLeadingCommentRange(text, node.pos, record);
      ts.forEachTrailingCommentRange(text, node.pos, record);
    }
    children.forEach(visit);
  };
  visit(source);
  return [...starts]
    .sort((left, right) => left - right)
    .map((pos) => source.getLineAndCharacterOfPosition(pos).line + 1);
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
