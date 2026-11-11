import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { checkTestRuns } from "../guard/test-runs.ts";
import {
  noteCovering,
  type RanTest,
  requirementText,
  results,
  runGuard,
  workflowDirectory,
} from "./guard-fixture.ts";

const checks = [checkTestRuns];
const testFile = "src/timer.test.ts";
const testPath = `${workflowDirectory}/${testFile}`;
const id = "workflow.timer-fires";
const testSource = 'import { test } from "vitest";\n';

/** The workflow package with one test file and these tests in its result file. */
function ran(...tests: RanTest[]): Record<string, string> {
  return { [testFile]: testSource, ...results(tests) };
}

/** The guard's errors, without the hint about adding a decision note. */
async function errorsFor(
  base: Record<string, string>,
  head: Record<string, string>,
): Promise<string[]> {
  const { errors } = await runGuard({ base, head, checks });
  return errors.map((error) => error.replace(/ That needs a decision note: .*$/, ""));
}

const two = ran(
  { name: "fires", requirement: id, assertions: 2 },
  { name: "fires once", requirement: id, assertions: 1 },
);

verifies("check.guard-deleted-tests", () => {
  test("fails when a test file is deleted", async () => {
    const head = results([{ name: "other", file: "src/other.test.ts" }]);
    const errors = await errorsFor(two, { "src/other.test.ts": testSource, ...head });
    expect(errors).toContain(`${testPath}: The test file ${testPath} was deleted.`);
  });

  test("fails when fewer tests run in a test file", async () => {
    const errors = await errorsFor(ran({ name: "a" }, { name: "b" }), ran({ name: "a" }));
    expect(errors).toEqual([`${testPath}: 1 test(s) ran in ${testPath}, 2 on the merge base.`]);
  });

  test("passes a deleted test file the decision note covers", async () => {
    const note = noteCovering(testPath);
    const outcome = await runGuard({ base: ran({ name: "a" }), head: {}, note, checks });
    expect(outcome.errors).toEqual([]);
  });

  test("passes when the same tests run, or more", async () => {
    expect(await errorsFor(ran({ name: "a" }), ran({ name: "a" }))).toEqual([]);
    expect(await errorsFor(ran({ name: "a" }), ran({ name: "a" }, { name: "b" }))).toEqual([]);
  });
});

verifies("check.guard-fewer-tests-per-requirement", () => {
  const moved = ran(
    { name: "fires", requirement: id, assertions: 2 },
    { name: "fires once", requirement: "workflow.other", assertions: 1 },
  );

  test("fails when fewer tests run for a requirement, even with the same total", async () => {
    const errors = await errorsFor(two, moved);
    expect(errors).toContain(
      `${testPath}: 1 test(s) ran for the requirement "${id}", 2 on the merge base.`,
    );
  });

  test("doesn't count a skipped test as run", async () => {
    const skipped = ran(
      { name: "fires", requirement: id, assertions: 2 },
      { name: "fires once", requirement: id, status: "skipped" },
    );
    expect((await errorsFor(two, skipped)).join("\n")).toMatch(/1 test\(s\) ran for/);
  });

  test("passes when the note covers the requirement", async () => {
    const note = noteCovering(id, testPath);
    expect((await runGuard({ base: two, head: moved, note, checks })).errors).toEqual([]);
  });
});

verifies("check.guard-fewer-assertions", () => {
  const fewer = ran(
    { name: "fires", requirement: id, assertions: 1 },
    { name: "fires once", requirement: id, assertions: 1 },
  );

  /** The same results, with the test file edited (what weakening a test takes). */
  const edited = (files: Record<string, string>): Record<string, string> => ({
    ...files,
    [testFile]: `${testSource}// edited\n`,
  });

  test("fails when a requirement's tests make fewer expect calls and the test file changed", async () => {
    expect(await errorsFor(two, edited(fewer))).toEqual([
      `${testPath}: The tests of the requirement "${id}" made 2 expect call(s), 3 on the merge base.`,
    ]);
  });

  test("fails when fewer expect calls come with a changed requirement file", async () => {
    const requirement = `requirements/${id.replace("workflow.", "")}.md`;
    const errors = await errorsFor(
      { ...two, [requirement]: requirementText("timer-fires", "active", "Before.") },
      { ...fewer, [requirement]: requirementText("timer-fires", "active", "After.") },
    );
    expect(errors.join("\n")).toMatch(/made 2 expect call\(s\), 3 on the merge base/);
  });

  test("fails when a helper in the package changed, the test file didn't, and there are fewer calls", async () => {
    const helper = "src/assert-timer.ts";
    const errors = await errorsFor(
      { ...two, [helper]: "export const assertTimer = 2;\n" },
      { ...fewer, [helper]: "export const assertTimer = 1;\n" },
    );
    expect(errors).toEqual([
      `${testPath}: The tests of the requirement "${id}" made 2 expect call(s), 3 on the merge base.`,
    ]);
  });

  test("passes a lower expect count in a package nothing changed in: that is run-to-run noise", async () => {
    expect(await errorsFor(two, fewer)).toEqual([]);
  });

  describe("tests that retry with vi.waitFor", () => {
    const helper = "src/assert-timer.ts";
    const retrySource =
      'import { expect, test, vi } from "vitest";\nawait vi.waitFor(() => expect(fired).toBe(true));\n';
    const retrying = (files: Record<string, string>): Record<string, string> => ({
      ...files,
      [testFile]: retrySource,
    });
    const withHelper = (files: Record<string, string>, calls: number): Record<string, string> => ({
      ...files,
      [helper]: `export const assertTimer = ${calls};\n`,
    });

    test("passes a lower count when only other files in the package changed", async () => {
      const errors = await errorsFor(retrying(withHelper(two, 2)), retrying(withHelper(fewer, 1)));
      expect(errors).toEqual([]);
    });

    test("fails when a test drops to 0 calls: a retry runs its expect calls at least once", async () => {
      const none = ran(
        { name: "fires", requirement: id, assertions: 2 },
        { name: "fires once", requirement: id, assertions: 0 },
      );
      const errors = await errorsFor(retrying(withHelper(two, 2)), retrying(withHelper(none, 1)));
      expect(errors).toEqual([
        `${testPath}: The tests of the requirement "${id}" made 2 expect call(s), 3 on the merge base.`,
      ]);
    });

    test("fails a lower count in a test file of the requirement without vi.waitFor", async () => {
      const otherFile = "src/timer-later.test.ts";
      const withOther = (calls: number): Record<string, string> => ({
        ...retrying(withHelper({}, calls)),
        [otherFile]: testSource,
        ...results([
          { name: "fires", requirement: id, assertions: 2 },
          { name: "fires once", requirement: id, assertions: 1 },
          { name: "fires later", file: otherFile, requirement: id, assertions: calls },
        ]),
      });
      expect(await errorsFor(withOther(4), withOther(1))).toEqual([
        `${testPath}: The tests of the requirement "${id}" made 4 expect call(s), 7 on the merge base.`,
      ]);
    });

    test("fails a lower count when vi.waitFor is only in a string, without an import of vi", async () => {
      const mention = (files: Record<string, string>): Record<string, string> => ({
        ...files,
        [testFile]: `${testSource}const text = "await vi.waitFor(() => expect(fired).toBe(true));";\n`,
      });
      const errors = await errorsFor(mention(withHelper(two, 2)), mention(withHelper(fewer, 1)));
      expect(errors).toEqual([
        `${testPath}: The tests of the requirement "${id}" made 2 expect call(s), 3 on the merge base.`,
      ]);
    });

    test("fails a lower count when the test file changed", async () => {
      const head = retrying(fewer);
      const errors = await errorsFor(retrying(two), {
        ...head,
        [testFile]: `${head[testFile]}// edited\n`,
      });
      expect(errors).toEqual([
        `${testPath}: The tests of the requirement "${id}" made 2 expect call(s), 3 on the merge base.`,
      ]);
    });
  });

  test("passes the same or more expect calls, or a note that covers the requirement", async () => {
    expect(await errorsFor(two, two)).toEqual([]);
    expect(await errorsFor(fewer, two)).toEqual([]);
    const note = noteCovering(id);
    const head = edited(fewer);
    expect((await runGuard({ base: two, head, note, checks })).errors).toEqual([]);
  });
});

verifies("check.guard-needs-test-results", () => {
  test("fails when either checkout has tests but no result file", async () => {
    const resultFile = `${workflowDirectory}/test-results/vitest.json`;
    const withoutResults = { [testFile]: testSource };
    expect(await errorsFor(withoutResults, two)).toEqual([
      `${resultFile}: The merge base's ${resultFile} is missing, so the guard can't compare its tests. Run the merge base's tests first.`,
    ]);
    const unreadable = { [testFile]: testSource, "test-results/vitest.json": "{" };
    expect((await errorsFor(two, unreadable)).join("\n")).toMatch(
      /The pull request's .* is unreadable/,
    );
  });

  test("fails even with a decision note: no note can stand in for the results", async () => {
    const withoutResults = { [testFile]: testSource };
    const note = noteCovering(workflowDirectory, testPath);
    const outcome = await runGuard({ base: withoutResults, head: two, note, checks });
    expect(outcome.errors.join("\n")).toMatch(/The merge base's .* is missing/);
  });

  test("passes a package without tests and without a result file", async () => {
    expect(await errorsFor({}, {})).toEqual([]);
  });
});
