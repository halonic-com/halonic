import type { TestOutcome } from "./test-results.ts";
import type { TracedRequirement } from "./trace-model.ts";
import type { WorkspacePackage } from "./workspace.ts";

/** The report's file name, next to the result file it is made from. */
export const requirementReportFile = "test-results/requirements.md";

/** One package's requirements, for its report. */
export interface PackageRequirements {
  readonly pkg: WorkspacePackage;
  readonly requirements: readonly TracedRequirement[];
}

/** Groups the requirements by the package they belong to, in package order. */
export function groupByPackage(requirements: readonly TracedRequirement[]): PackageRequirements[] {
  const groups = new Map<WorkspacePackage, TracedRequirement[]>();
  for (const traced of requirements) {
    const group = groups.get(traced.pkg) ?? [];
    group.push(traced);
    groups.set(traced.pkg, group);
  }
  return [...groups]
    .map(([pkg, group]) => ({
      pkg,
      requirements: group.toSorted((left, right) =>
        left.requirement.id.localeCompare(right.requirement.id),
      ),
    }))
    .sort((left, right) => left.pkg.directory.localeCompare(right.pkg.directory));
}

/** What the last test run says about a requirement, in a few words. */
export function requirementResult(traced: TracedRequirement): string {
  const { tests } = traced;
  if (tests.length === 0) {
    return "no tests ran";
  }
  const passed = tests.filter((test) => test.status === "passed").length;
  if (passed === tests.length) {
    return `passed (${passed} of ${tests.length})`;
  }
  return `not passed (${passed} of ${tests.length})`;
}

/**
 * Writes one package's requirement report as Markdown: a table
 * of every requirement with its status and result, then each requirement
 * with its sentence and the tests that ran for it.
 *
 * @example
 * renderRequirementReport(groupByPackage(buildTraceModel(context).requirements)[0]);
 */
export function renderRequirementReport({ pkg, requirements }: PackageRequirements): string {
  const name = pkg.manifest.name ?? pkg.directory;
  const lines = [
    `# Requirements: ${name}`,
    "",
    "Made by `pnpm check trace --report` from the requirement files and the last test run. Don't edit it.",
    "",
    "| Requirement | Status | Since | Result |",
    "| --- | --- | --- | --- |",
  ];
  for (const traced of requirements) {
    const { id, status, since } = traced.requirement;
    const cells = [`[\`${id}\`](#${anchorOf(id)})`, status, since, requirementResult(traced)];
    lines.push(`| ${cells.map(inlineText).join(" | ")} |`);
  }
  for (const traced of requirements) {
    const { requirement, tests } = traced;
    lines.push(
      "",
      `## ${requirement.id}`,
      "",
      requirement.statement,
      "",
      `- Status: ${requirement.status}, since ${requirement.since}`,
      `- Source: ${inlineText(requirement.source)}`,
      `- File: \`${requirement.file}\``,
      "",
      "Examples:",
      "",
      ...requirement.examples.map((example) => `- ${example}`),
      "",
      "Tests:",
      "",
      ...testLines(tests),
    );
  }
  return `${lines.join("\n")}\n`;
}

function testLines(tests: readonly TestOutcome[]): string[] {
  if (tests.length === 0) {
    return ["- none ran"];
  }
  return tests.map((test) => `- ${test.status}: \`${test.file}\`: ${inlineText(test.name)}`);
}

/**
 * Makes text safe for one table cell or list item: line breaks become
 * spaces and `|` is escaped, so a test name can't break the table or list.
 */
export function inlineText(text: string): string {
  return text.replaceAll(/\s*[\r\n]+\s*/g, " ").replaceAll("|", "\\|");
}

/** GitHub's heading anchor for a requirement ID: dots are dropped. */
function anchorOf(id: string): string {
  return id.replaceAll(".", "");
}
