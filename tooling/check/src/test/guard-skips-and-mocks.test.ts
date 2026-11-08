import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkMocks } from "../guard/mocks.ts";
import { checkSkips } from "../guard/skips.ts";
import { noteCovering, runGuard, workflowDirectory } from "./guard-fixture.ts";

const testFile = "src/timer.test.ts";
const testPath = `${workflowDirectory}/${testFile}`;
const header =
  'import { verifies } from "@halonicjs/testing-spec";\nimport { test, vi } from "vitest";\n';

function timerTest(body: string): Record<string, string> {
  return {
    [testFile]: `${header}${body}\nverifies("workflow.timer-fires", () => {\n  test("fires", () => {});\n});\n`,
  };
}

verifies("check.guard-skips", () => {
  const checks = [checkSkips];

  test("fails when a pull request adds a skip, and points at it", async () => {
    const head = timerTest('test.skip("later", () => {});');
    const { errors } = await runGuard({ base: timerTest(""), head, checks });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(new RegExp(`^${testPath}: ${testPath} adds a skip: \\.skip \\(1, 0`));
  });

  test("fails when a Vitest config gains a retry setting", async () => {
    const config = (test: string): Record<string, string> => ({
      "vitest.config.ts": `export default definePackageTestConfig({ test: { ${test} } });\n`,
    });
    const head = config("retry: 2");
    const { errors } = await runGuard({ base: config(""), head, checks });
    expect(errors.join("\n")).toMatch(/vitest\.config\.ts adds a skip: retry option/);
  });

  test("passes skips the merge base already had, and new ones a note covers", async () => {
    const skipped = timerTest('test.skip("later", () => {});');
    expect((await runGuard({ base: skipped, head: skipped, checks })).errors).toEqual([]);
    const note = noteCovering(testPath);
    expect((await runGuard({ base: timerTest(""), head: skipped, note, checks })).errors).toEqual(
      [],
    );
  });
});

verifies("check.guard-mocks", () => {
  const checks = [checkMocks];

  test("fails on a new mock of the package's own code", async () => {
    for (const mock of ['vi.mock("./timer.ts");', 'vi.mock("@halonicjs/workflow");']) {
      const { errors } = await runGuard({ base: timerTest(""), head: timerTest(mock), checks });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(
        /replaces code of @halonicjs\/workflow, the package its requirements \(workflow\.timer-fires\) are about/,
      );
    }
  });

  test("passes mocks of other modules, mocks the merge base had, and covered ones", async () => {
    const outside = timerTest('vi.mock("node:fs");\nvi.mock("@halonicjs/std");');
    expect((await runGuard({ base: timerTest(""), head: outside, checks })).errors).toEqual([]);
    const own = timerTest('vi.mock("./timer.ts");');
    expect((await runGuard({ base: own, head: own, checks })).errors).toEqual([]);
    const note = noteCovering(testPath);
    expect((await runGuard({ base: timerTest(""), head: own, note, checks })).errors).toEqual([]);
  });

  test("passes a new own mock in a test file without verifies() tests", async () => {
    const plain = { [testFile]: 'import { vi } from "vitest";\nvi.mock("./timer.ts");\n' };
    expect((await runGuard({ base: {}, head: plain, checks })).errors).toEqual([]);
  });
});
