import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkRequirementChanges } from "../guard/requirement-changes.ts";
import { checkTestRuns } from "../guard/test-runs.ts";
import { type RanTest, requirementText, results, runGuard } from "./guard-fixture.ts";

const checks = [checkRequirementChanges, checkTestRuns];
const name = "requirements/timer-fires.md";
const original = requirementText("timer-fires");
const changedOnMain = requirementText("timer-fires", "active", "The engine shall fire the timer.");
const showTest = "src/show.test.ts";
const timerTest = "src/timer.test.ts";
const testSource = (count: number): string =>
  `import { test } from "vitest";\n${'test("t", () => {});\n'.repeat(count)}`;

/** The workflow package with these test files and these tests in its result file. */
function commit(
  requirement: string,
  showTests: number,
  ran: readonly RanTest[] = [],
): Record<string, string> {
  return {
    [name]: requirement,
    [showTest]: testSource(showTests),
    [timerTest]: testSource(1),
    ...(ran.length === 0 ? {} : results(ran)),
  };
}

const shows = (count: number): RanTest[] =>
  Array.from({ length: count }, (_, at) => ({ name: `shows ${at}`, file: showTest }));
const fires: RanTest = { name: "fires", file: timerTest, requirement: "workflow.timer-fires" };

/**
 * #2226 at f22d5d5: main's newest commit B was red, so the guard's test
 * results came from A, ten commits older. Between them main edited the
 * requirement and cut show.test.ts from 3 tests to 1. The pull request
 * touches neither.
 */
const green = commit(original, 3, [...shows(3), fires]);
const builtOn = commit(changedOnMain, 1);
const merged = (ran: readonly RanTest[]): Record<string, string> => commit(changedOnMain, 1, ran);

verifies("check.guard-base-after-walk-back", () => {
  test("reports nothing main changed between the green commit and the one the pull request is built on", async () => {
    const { errors } = await runGuard({
      tested: green,
      base: builtOn,
      head: merged([...shows(1), fires]),
      checks,
    });
    expect(errors).toEqual([]);
  });

  test("comparing with the green commit alone would blame the pull request for main's changes", async () => {
    const { errors } = await runGuard({ base: green, head: merged([...shows(1), fires]), checks });
    expect(errors.join("\n")).toMatch(/"workflow.timer-fires" was edited/);
    expect(errors.join("\n")).toMatch(/1 test\(s\) ran in .*show\.test\.ts, 3 on the merge base/);
  });

  test("still reports a test the pull request drops from a file main didn't change", async () => {
    const { errors } = await runGuard({
      tested: green,
      base: builtOn,
      head: merged(shows(1)),
      checks,
    });
    expect(errors.join("\n")).toMatch(/0 test\(s\) ran in .*timer\.test\.ts, 1 on the merge base/);
  });

  test("still reports a requirement the pull request edits", async () => {
    const edited = requirementText("timer-fires", "active", "The engine shall fire it twice.");
    const { errors } = await runGuard({
      tested: green,
      base: builtOn,
      head: { ...merged([...shows(1), fires]), [name]: edited },
      checks,
    });
    expect(errors.join("\n")).toMatch(/"workflow.timer-fires" was edited/);
  });

  test("CI gives the guard the commit the merge ref was built on after a walk-back", () => {
    const workflow = readFileSync(
      join(import.meta.dirname, "../../../../.github/workflows/ci.yml"),
      "utf8",
    );
    expect(workflow).toContain("built-on: ${{ steps.merge-base.outputs.sha }}");
    expect(workflow).toContain("ref: ${{ needs.base-tests.outputs.built-on }}");
    expect(workflow).toMatch(
      /if \[ "\$BUILT_ON_SHA" != "\$BASE_SHA" \]; then\n\s+built_on=\(--built-on "\$BUILT_ON_DIR"\)/,
    );
    expect(workflow).toContain('--base "$BASE_DIR" "${built_on[@]}"');
  });
});
