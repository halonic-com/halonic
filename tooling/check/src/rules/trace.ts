import { appVersionFiles, jsonVersion } from "../lib/app-version.ts";
import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { type ReleaseTags, releaseTags } from "../lib/release-tags.ts";
import { unreleased } from "../lib/requirements.ts";
import { testResultsFile } from "../lib/test-results.ts";
import { buildTraceModel, type TracedRequirement, type TraceModel } from "../lib/trace-model.ts";

/**
 * The traceability check. Fails when:
 * - a requirement file is malformed
 * - the same requirement ID is in two places (v1.6)
 * - a `verifies(…)` names a requirement that doesn't exist or is retired
 * - a `verifies(…)` never ran, because the runner doesn't collect its file
 * - a package has tests but no result file, or one that can't be read
 * - an active requirement has no test that ran and passed
 * - a requirement's `Since` names a release it isn't in (HAL-13777)
 *
 * It reads the result files the tests wrote, so the tests run first:
 * `pnpm verify` runs this rule after them.
 */
export function checkTrace(context: CheckContext): Report {
  const report = new Report("trace");
  const model = buildTraceModel(context);
  for (const finding of model.malformed) {
    report.error(finding.file, `Malformed requirement file: ${finding.message}`, finding.line);
  }
  const byId = groupById(model.requirements);
  reportDuplicateIds(byId, report);
  // A test in scope may verify a requirement of a package outside it.
  const allById = groupById([...model.requirements, ...model.outOfScope]);
  reportVerifiesCalls(model, allById, report);
  reportTaggedTests(model, allById, report);
  reportMissingResults(model, report);
  reportUnreadableResults(model, report);
  reportUnproven(model, report);
  reportUnreleasedSince(context, model, report);
  return report;
}

function groupById(requirements: readonly TracedRequirement[]): Map<string, TracedRequirement[]> {
  const byId = new Map<string, TracedRequirement[]>();
  for (const traced of requirements) {
    const places = byId.get(traced.requirement.id) ?? [];
    places.push(traced);
    byId.set(traced.requirement.id, places);
  }
  return byId;
}

function reportDuplicateIds(byId: Map<string, TracedRequirement[]>, report: Report): void {
  for (const [id, places] of byId) {
    if (places.length < 2) {
      continue;
    }
    for (const place of places) {
      const others = places
        .filter((other) => other !== place)
        .map((other) => other.requirement.file);
      report.error(
        place.requirement.file,
        `The requirement ID "${id}" is also used by ${others.join(", ")}. IDs are unique across the repo; rename one of them.`,
      );
    }
  }
}

function reportVerifiesCalls(
  model: TraceModel,
  byId: Map<string, TracedRequirement[]>,
  report: Report,
): void {
  const ran = new Set(model.taggedTests.map((test) => runKey(test.file, test.requirement)));
  for (const call of model.calls) {
    if (call.id === undefined) {
      report.error(
        call.file,
        "verifies() needs the requirement ID as a plain string, so the trace check can read it.",
        call.line,
      );
      continue;
    }
    const problem = targetProblem(call.id, byId);
    if (problem !== undefined) {
      report.error(call.file, `verifies("${call.id}") ${problem}`, call.line);
      continue;
    }
    // A package without a readable result file gets one finding of its own instead.
    const withoutRun = [...model.withoutResults, ...model.unreadableResults.keys()];
    const resultsMissing = withoutRun.some((pkg) => call.file.startsWith(`${pkg.directory}/`));
    if (!resultsMissing && !ran.has(runKey(call.file, call.id))) {
      report.error(
        call.file,
        `verifies("${call.id}") never ran: its tests are not in the package's result file. Check that the package's vitest.config.ts collects this file, and run the tests again.`,
        call.line,
      );
    }
  }
}

/**
 * The result files are the backstop for calls the source scan can't see,
 * such as `verifies` passed around under another name.
 */
function reportTaggedTests(
  model: TraceModel,
  byId: Map<string, TracedRequirement[]>,
  report: Report,
): void {
  const seen = new Set(model.calls.map((call) => runKey(call.file, call.id)));
  for (const test of model.taggedTests) {
    const key = runKey(test.file, test.requirement);
    if (test.requirement === undefined || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const problem = targetProblem(test.requirement, byId);
    if (problem !== undefined) {
      report.error(test.file, `The test "${test.name}" ${problem}`);
    }
  }
}

function runKey(file: string, id: string | undefined): string {
  return `${file}\0${id ?? ""}`;
}

/** Why tests may not point at this ID, or `undefined` when they may. */
function targetProblem(id: string, byId: Map<string, TracedRequirement[]>): string | undefined {
  const places = byId.get(id);
  if (places === undefined) {
    return `names the requirement "${id}", which doesn't exist. Add its requirements/<name>.md file, or fix the ID.`;
  }
  if (places.every((place) => place.requirement.status === "retired")) {
    return `names the retired requirement "${id}". Remove these tests, or point them at the requirement that replaced it.`;
  }
  return undefined;
}

function reportMissingResults(model: TraceModel, report: Report): void {
  for (const pkg of model.withoutResults) {
    const name = pkg.manifest.name ?? pkg.directory;
    report.error(
      `${pkg.directory}/${testResultsFile}`,
      `${name} has tests but no result file. Run its tests first: pnpm verify, or pnpm turbo run test --filter ${name}.`,
    );
  }
}

function reportUnreadableResults(model: TraceModel, report: Report): void {
  for (const [pkg, reason] of model.unreadableResults) {
    const name = pkg.manifest.name ?? pkg.directory;
    report.error(
      `${pkg.directory}/${testResultsFile}`,
      `${name}'s result file can't be read: ${reason}. Delete it and run the package's tests again.`,
    );
  }
}

function reportUnproven(model: TraceModel, report: Report): void {
  for (const { requirement, tests } of model.requirements) {
    if (requirement.status !== "active") {
      continue;
    }
    if (tests.some((test) => test.status === "passed")) {
      continue;
    }
    const why = tests.length === 0 ? "has no test that ran" : "has tests, but none of them passed";
    report.error(
      requirement.file,
      `The active requirement "${requirement.id}" ${why}. Prove it with verifies("${requirement.id}", …) tests, and run them.`,
      1,
    );
  }
}

/**
 * `Since: <version>` must name a release that has the requirement: the tag
 * `v<version>` exists and holds the requirement, by its path or by its ID.
 * The one version without a tag that passes is the app version while its
 * release is being cut: the release pull request writes it before the
 * release bot tags the merged commit. A checkout with no release tags at
 * all gets no exception: one error tells it to fetch them.
 */
function reportUnreleasedSince(context: CheckContext, model: TraceModel, report: Report): void {
  const named = model.requirements.filter(({ requirement }) => requirement.since !== unreleased);
  const [first] = named;
  if (first === undefined) {
    return;
  }
  const tags = releaseTags(context.root);
  if (!tags.any) {
    // Nothing can be checked without tags, not even the release exception:
    // the app version is also the last release's version until the next
    // release pull request raises it (HAL-14684). One error, not one per file.
    const { file } = first.requirement;
    report.error(
      file,
      `This checkout has no release tags, so the ${named.length} requirements whose "Since" names a version can't be checked: fetch the tags with \`git fetch --tags\` and run the check again.`,
      sinceLine(context, file),
    );
    return;
  }
  const releasing = appVersion(context);
  for (const { requirement } of named) {
    const problem = sinceProblem(
      requirement.id,
      requirement.file,
      requirement.since,
      tags,
      releasing,
    );
    if (problem !== undefined) {
      report.error(requirement.file, problem, sinceLine(context, requirement.file));
    }
  }
}

/** What is wrong with a requirement's `Since: <version>`, or `undefined` when it is right. */
function sinceProblem(
  id: string,
  file: string,
  version: string,
  tags: ReleaseTags,
  releasing: string | undefined,
): string | undefined {
  const released = tags.requirementsAt(version);
  if (released === undefined) {
    if (version === releasing) {
      return undefined;
    }
    return `No tag v${version}; write "Since: ${unreleased}".`;
  }
  if (released.files.has(file) || released.ids.has(id)) {
    return undefined;
  }
  return `"${id}" isn't in v${version}; write "Since: ${unreleased}".`;
}

/** The app version, which is the version a release is cut under, if the repo has the app. */
function appVersion(context: CheckContext): string | undefined {
  const file = appVersionFiles.packageJson;
  return context.files.includes(file) ? jsonVersion(context.read(file)) : undefined;
}

/** The line of a requirement file's `- Since:` field. */
function sinceLine(context: CheckContext, file: string): number | undefined {
  const index = context
    .read(file)
    .split("\n")
    .findIndex((line) => line.startsWith("- Since:"));
  return index === -1 ? undefined : index + 1;
}
