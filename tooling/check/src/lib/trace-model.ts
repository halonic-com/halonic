import type { CheckContext } from "./context.ts";
import {
  expectedRequirementId,
  isRequirementFile,
  parseRequirementFile,
  type Requirement,
} from "./requirements.ts";
import { isSourceFile, isTestFile } from "./source-files.ts";
import { readTestResults, type TestOutcome } from "./test-results.ts";
import { findVerifiesCalls, type VerifiesCall } from "./verifies-calls.ts";
import { owningPackage, type WorkspacePackage } from "./workspace.ts";

/** A requirement, the package it belongs to and the tests that ran for it. */
export interface TracedRequirement {
  readonly requirement: Requirement;
  readonly pkg: WorkspacePackage;
  readonly tests: readonly TestOutcome[];
}

/** A finding about one place in one file. */
export interface FileFinding {
  readonly file: string;
  readonly line?: number;
  readonly message: string;
}

/** What the trace check and the requirement report work from. */
export interface TraceModel {
  /** Every well-formed requirement file, in path order. */
  readonly requirements: readonly TracedRequirement[];
  /** Requirement files that are malformed or not inside a package. */
  readonly malformed: readonly FileFinding[];
  /** Every `verifies(…)` call in a test file. */
  readonly calls: readonly VerifiesCall[];
  /** Every test in the result files that `verifies()` tagged with a requirement. */
  readonly taggedTests: readonly TestOutcome[];
  /** Packages with test files but no result file. */
  readonly withoutResults: ReadonlySet<WorkspacePackage>;
  /** Packages whose result file can't be read, with the reason. */
  readonly unreadableResults: ReadonlyMap<WorkspacePackage, string>;
}

/** Reads every requirement file, `verifies` call and result file in the repo. */
export function buildTraceModel(context: CheckContext): TraceModel {
  const found: { requirement: Requirement; pkg: WorkspacePackage }[] = [];
  const malformed: FileFinding[] = [];
  const calls: VerifiesCall[] = [];
  const packagesWithTests = new Set<WorkspacePackage>();
  for (const file of context.files) {
    const pkg = owningPackage(file, context.packages);
    if (pkg === undefined) {
      continue;
    }
    if (isRequirementFile(file)) {
      if (pkg.directory === ".") {
        malformed.push({ file, message: "Requirement files live inside a package." });
        continue;
      }
      const expectedId = expectedRequirementId(file, pkg.directory);
      const parsed = parseRequirementFile(file, context.read(file), expectedId);
      if (parsed.ok) {
        found.push({ requirement: parsed.requirement, pkg });
        continue;
      }
      for (const problem of parsed.problems) {
        malformed.push({ file, line: problem.line, message: problem.message });
      }
    } else if (isTestFile(file) && isSourceFile(file) && pkg.directory !== ".") {
      packagesWithTests.add(pkg);
      calls.push(...findVerifiesCalls(file, context.read(file)));
    }
  }

  const taggedTests: TestOutcome[] = [];
  const withoutResults = new Set<WorkspacePackage>();
  const unreadableResults = new Map<WorkspacePackage, string>();
  for (const pkg of context.packages) {
    const results = readTestResults(context.root, pkg.directory);
    if (results.kind === "missing") {
      if (packagesWithTests.has(pkg)) {
        withoutResults.add(pkg);
      }
    } else if (results.kind === "unreadable") {
      unreadableResults.set(pkg, results.reason);
    } else {
      taggedTests.push(...results.outcomes.filter((outcome) => outcome.requirement !== undefined));
    }
  }

  const requirements = found.map(({ requirement, pkg }) => ({
    requirement,
    pkg,
    tests: taggedTests.filter((test) => test.requirement === requirement.id),
  }));
  return { requirements, malformed, calls, taggedTests, withoutResults, unreadableResults };
}
