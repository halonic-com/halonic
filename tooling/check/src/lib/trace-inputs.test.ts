import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { readTestResults, testResultsFile } from "./test-results.ts";
import { findVerifiesCalls } from "./verifies-calls.ts";

describe("readTestResults", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function repoWithResults(report: unknown): string {
    const root = mkdtempSync(join(tmpdir(), "halonic-results-"));
    roots.push(root);
    const directory = join(root, "packages/core/workflow/test-results");
    mkdirSync(directory, { recursive: true });
    const text = typeof report === "string" ? report : JSON.stringify(report);
    writeFileSync(join(root, "packages/core/workflow", testResultsFile), text);
    return root;
  }

  test("says so when the package has no result file", () => {
    const root = repoWithResults({});
    expect(readTestResults(root, "packages/core/std")).toEqual({ kind: "missing" });
  });

  test("gives a reason instead of throwing when the result file is corrupt", () => {
    const corrupt: [unknown, string][] = [
      ['{"testResults": [', "isn't valid JSON"],
      [null, "has no testResults list"],
      [{ testResults: {} }, "has no testResults list"],
      [{ testResults: [{ name: "a.test.ts" }] }, "no name or assertionResults"],
      [{ testResults: [{ name: "a.test.ts", assertionResults: [{}] }] }, "no fullName or status"],
    ];
    for (const [report, reason] of corrupt) {
      const results = readTestResults(repoWithResults(report), "packages/core/workflow");
      expect(results.kind).toBe("unreadable");
      expect(results.kind === "unreadable" && results.reason).toContain(reason);
    }
  });

  test("reads each test with its file relative to the repo, its status, requirement and expect count", () => {
    const root = repoWithResults({
      testResults: [
        {
          name: "/ci/other-checkout/packages/core/workflow/src/timer.test.ts",
          assertionResults: [
            {
              fullName: "workflow.timer fires",
              status: "passed",
              meta: { requirement: "workflow.timer", assertions: 2 },
            },
            { fullName: "helper works", status: "failed", meta: {} },
            {
              fullName: "odd tag",
              status: "passed",
              meta: { requirement: 42, assertions: "2" },
            },
          ],
        },
        {
          name: "C:\\work\\halonic\\packages\\core\\workflow\\src\\cron.test.ts",
          assertionResults: [{ fullName: "cron", status: "skipped" }],
        },
      ],
    });
    const results = readTestResults(root, "packages/core/workflow");
    expect(results.kind === "read" && results.outcomes).toEqual([
      {
        file: "packages/core/workflow/src/timer.test.ts",
        name: "workflow.timer fires",
        status: "passed",
        requirement: "workflow.timer",
        assertions: 2,
      },
      {
        file: "packages/core/workflow/src/timer.test.ts",
        name: "helper works",
        status: "failed",
        requirement: undefined,
        assertions: undefined,
      },
      {
        file: "packages/core/workflow/src/timer.test.ts",
        name: "odd tag",
        status: "passed",
        requirement: undefined,
        assertions: undefined,
      },
      {
        file: "packages/core/workflow/src/cron.test.ts",
        name: "cron",
        status: "skipped",
        requirement: undefined,
        assertions: undefined,
      },
    ]);
  });
});

describe("findVerifiesCalls", () => {
  const file = "packages/core/workflow/src/timer.test.ts";

  test("finds calls of verifies imported from testing-spec, with ID and line", () => {
    const text = [
      'import { verifies } from "@halonicjs/testing-spec";',
      "",
      'verifies("workflow.timer", () => {});',
      "verifies(`workflow.cron`, () => {});",
      "verifies(someId, () => {});",
    ].join("\n");
    expect(findVerifiesCalls(file, text)).toEqual([
      { file, line: 3, id: "workflow.timer" },
      { file, line: 4, id: "workflow.cron" },
      { file, line: 5, id: undefined },
    ]);
  });

  test("follows an alias and a namespace import", () => {
    const text = [
      'import { verifies as proves } from "@halonicjs/testing-spec";',
      'import * as spec from "@halonicjs/testing-spec";',
      'proves("workflow.a", () => {});',
      'spec.verifies("workflow.b", () => {});',
      'spec.other("workflow.c");',
    ].join("\n");
    expect(findVerifiesCalls(file, text).map((call) => call.id)).toEqual([
      "workflow.a",
      "workflow.b",
    ]);
  });

  test("ignores other functions named verifies", () => {
    const local = 'import { verifies } from "./verifies.ts";\nverifies("spec.inner", () => {});\n';
    expect(findVerifiesCalls(file, local)).toEqual([]);
    const shadowed =
      'import { verifies as v } from "@halonicjs/testing-spec";\nverifies("workflow.x", () => {});\n';
    expect(findVerifiesCalls(file, shadowed)).toEqual([]);
  });
});
