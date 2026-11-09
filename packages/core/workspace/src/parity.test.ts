// Acceptance (HAL-871): every message the old loader gave from a check
// between files, in the base and every case of the parity fixtures, must come
// from loadWorkspace on the same file, with the same severity and words, in
// the same order. The compare and the allowed differences live in
// testing-parity; this file only feeds it loadWorkspace. Each file's own
// result is format's parity test.
import {
  allowedDifferencesFile,
  type CheckCase,
  type CheckComparison,
  checkCases,
  checksByFile,
  compareChecks,
  judgeChecks,
  readAllowedDifferences,
} from "@halonicjs/testing-parity";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "./index.ts";
import { caseSource, parityFixtures } from "./test/parity-cases.spec.ts";

/** One fixture's old and new messages from checks between files, file by file. */
async function compareCase(checkCase: CheckCase): Promise<CheckComparison[]> {
  const workspace = await loadWorkspace(caseSource(checkCase.parityCase));
  const fresh = checksByFile(workspace.issues.filter((issue) => issue.source === "check"));
  return compareChecks(checkCase, fresh);
}

const cases = checkCases(parityFixtures);
const comparisons: CheckComparison[] = [];
for (const checkCase of cases) {
  comparisons.push(...(await compareCase(checkCase)));
}
const report = judgeChecks(comparisons, readAllowedDifferences(allowedDifferencesFile));

verifies("workspace.parity-fixtures", () => {
  it("compares the old loader's messages between files in every fixture", () => {
    expect(cases.length).toBeGreaterThan(150);
    const oldMessages = comparisons.reduce((count, result) => count + result.old.length, 0);
    expect(oldMessages).toBeGreaterThan(150);
  });

  it("has no difference that isn't allowed, and no stale allowed difference", () => {
    expect(report.unexplained.map((result) => [result.name, result.old, result.new])).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  it("gives the base no message from a check between files", () => {
    expect(report.results.filter((result) => result.caseId === "base")).toEqual([]);
  });

  it("gives agent/unknown-model the old loader's one error, on the agent", () => {
    const found = report.results.filter((result) => result.caseId === "agent/unknown-model");
    expect(found.map((result) => [result.file, result.new.length, result.verdict])).toEqual([
      ["hubs/billing/agents/clerk.agent.yaml", 1, "same"],
    ]);
  });

  it("gives routine/bad-cron the routines package's message, as an entry allows", () => {
    const found = report.results.find((result) => result.caseId === "routine/bad-cron");
    expect(found?.entry).toBe("routine-trigger-messages-are-sentences");
  });

  it.each(report.results)("matches the recording for $name", (result) => {
    expect(result.verdict, JSON.stringify({ old: result.old, new: result.new })).not.toBe(
      "different",
    );
  });
});
