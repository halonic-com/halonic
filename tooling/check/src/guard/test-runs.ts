import type { CheckContext } from "../lib/context.ts";
import { expectedRequirementId } from "../lib/requirements.ts";
import { isSourceFile, isTestFile } from "../lib/source-files.ts";
import { readTestResults, type TestOutcome, testResultsFile } from "../lib/test-results.ts";
import { owningPackage } from "../lib/workspace.ts";
import { type Checkouts, changeOf, type GuardFinding } from "./finding.ts";

/** Statuses of a test that ran; skipped and todo tests didn't. */
const ranStatuses = ["passed", "failed"];

/**
 * Plan 9.3, point 3: no weakening tests. Compares the merge base's test
 * results with the pull request's, and finds:
 * - a deleted test file
 * - fewer tests that ran in a test file
 * - fewer tests that ran for a requirement, even if the total stays the same
 * - fewer `expect` calls for a requirement, if the pull request changes a file
 *   in a package that owns its tests, or its requirement file. The count is
 *   measured at run time, so a shared helper, a fixture or the code under
 *   test can weaken a test without editing it. A drop in a package nothing
 *   changed in is run-to-run noise (polling, tests that skip in some
 *   environments).
 * Both checkouts' tests must have run first. A missing or unreadable result
 * file is a finding too, so the guard fails closed.
 */
export function checkTestRuns(checkouts: Checkouts): GuardFinding[] {
  const { base, head } = checkouts;
  const findings: GuardFinding[] = [];
  for (const file of testFilesIn(base)) {
    if (!head.files.includes(file)) {
      findings.push({ subject: file, file, message: `The test file ${file} was deleted.` });
    }
  }
  const before = ranTests(base, "merge base", findings);
  const after = ranTests(head, "pull request", findings);
  // A deleted file has its own finding above.
  const fewerInFile = compareCounts(
    countBy(before, byFile),
    countBy(after, byFile),
    (file, was, now) => ({
      subject: file,
      file,
      message: `${now} test(s) ran in ${file}, ${was} on the merge base.`,
    }),
  ).filter((finding) => head.files.includes(finding.file));
  const fileOf = requirementFiles(before);
  const touched = touchedRequirements(checkouts, [...before, ...after]);
  const edited = (id: string): boolean => touched.has(id);
  findings.push(
    ...fewerInFile,
    ...compareCounts(
      countBy(before, byRequirement),
      countBy(after, byRequirement),
      (id, was, now) => ({
        subject: id,
        file: fileOf.get(id) ?? id,
        message: `${now} test(s) ran for the requirement "${id}", ${was} on the merge base.`,
      }),
    ),
    ...compareCounts(sumAssertions(before), sumAssertions(after), (id, was, now) => ({
      subject: id,
      file: fileOf.get(id) ?? id,
      message: `The tests of the requirement "${id}" made ${now} expect call(s), ${was} on the merge base.`,
    })).filter((finding) => finding.subject !== undefined && edited(finding.subject)),
  );
  return findings;
}

/** Test files inside a package, as the trace check counts them. */
function testFilesIn(context: CheckContext): string[] {
  return context.files.filter((file) => {
    const pkg = owningPackage(file, context.packages);
    return isTestFile(file) && isSourceFile(file) && pkg !== undefined && pkg.directory !== ".";
  });
}

/** The tests that ran in a checkout. A package with tests but no readable results is a finding. */
function ranTests(context: CheckContext, side: string, findings: GuardFinding[]): TestOutcome[] {
  const withTests = new Set(
    testFilesIn(context).map((file) => owningPackage(file, context.packages)?.directory),
  );
  const ran: TestOutcome[] = [];
  for (const pkg of context.packages) {
    if (!withTests.has(pkg.directory)) {
      continue;
    }
    const results = readTestResults(context.root, pkg.directory);
    if (results.kind === "read") {
      ran.push(...results.outcomes.filter((outcome) => ranStatuses.includes(outcome.status)));
      continue;
    }
    const file = `${pkg.directory}/${testResultsFile}`;
    findings.push({
      subject: undefined,
      file,
      message: `The ${side}'s ${file} is ${results.kind}, so the guard can't compare its tests. Run the ${side}'s tests first.`,
    });
  }
  return ran;
}

const byFile = (test: TestOutcome): string | undefined => test.file;
const byRequirement = (test: TestOutcome): string | undefined => test.requirement;

function countBy(
  tests: readonly TestOutcome[],
  key: (test: TestOutcome) => string | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const test of tests) {
    const name = key(test);
    if (name !== undefined) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/** The `expect` calls per requirement. A test without a recorded count counts as 0. */
function sumAssertions(tests: readonly TestOutcome[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const test of tests) {
    if (test.requirement !== undefined) {
      sums.set(test.requirement, (sums.get(test.requirement) ?? 0) + (test.assertions ?? 0));
    }
  }
  return sums;
}

/** A finding for every key whose count went down. */
function compareCounts(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  finding: (key: string, was: number, now: number) => GuardFinding,
): GuardFinding[] {
  const findings: GuardFinding[] = [];
  for (const [key, was] of before) {
    const now = after.get(key) ?? 0;
    if (now < was) {
      findings.push(finding(key, was, now));
    }
  }
  return findings;
}

/** A test file of each requirement, to point its findings at. */
function requirementFiles(tests: readonly TestOutcome[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const test of tests) {
    if (test.requirement !== undefined && !files.has(test.requirement)) {
      files.set(test.requirement, test.file);
    }
  }
  return files;
}

/**
 * The requirements the pull request may have weakened: those with a test in a
 * package where any file changed (a helper, a fixture, the code under test),
 * and those whose requirement file changed. The expect count is measured at
 * run time, so a test can lose calls without being edited. The generated
 * result file doesn't count as a change.
 */
function touchedRequirements(
  { base, head }: Checkouts,
  tests: readonly TestOutcome[],
): ReadonlySet<string> {
  const packageOf = (file: string): string | undefined =>
    (owningPackage(file, head.packages) ?? owningPackage(file, base.packages))?.directory;
  const changedPackages = new Set<string>();
  const touched = new Set<string>();
  for (const file of new Set([...base.files, ...head.files])) {
    const pkg = packageOf(file);
    if (pkg === undefined || file === `${pkg}/${testResultsFile}`) {
      continue;
    }
    if (changeOf(file, base, head) === undefined) {
      continue;
    }
    changedPackages.add(pkg);
    if (pkg !== "." && file.endsWith(".md") && file.includes("/requirements/")) {
      touched.add(expectedRequirementId(file, pkg));
    }
  }
  for (const test of tests) {
    const pkg = packageOf(test.file);
    if (test.requirement !== undefined && pkg !== undefined && changedPackages.has(pkg)) {
      touched.add(test.requirement);
    }
  }
  return touched;
}
