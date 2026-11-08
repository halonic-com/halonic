import { verifies } from "@halonicjs/testing-spec";
import { testResultsFile as presetResultsFile } from "@halonicjs/tooling-config/vitest";
import { describe, expect, test } from "vitest";
import { testResultsFile } from "../lib/test-results.ts";
import { type FixturePackage, manifestFor, runChecks } from "./fixture-repo.ts";

const workflowDirectory = "packages/core/workflow";
const testFile = "src/timer.test.ts";

function requirementText(id: string, status = "active"): string {
  return `# ${id}

- Status: ${status}
- Since: 0.1.0
- Source: HAL-107

When the delay has passed, the engine shall fire the timer.

## Examples

- Given a timer of 5 minutes, when 5 minutes pass, then it fires.
`;
}

function testText(...ids: string[]): string {
  const blocks = ids.map((id) => `verifies("${id}", () => {\n  test("fires", () => {});\n});\n`);
  return `import { verifies } from "@halonicjs/testing-spec";\nimport { test } from "vitest";\n\n${blocks.join("\n")}`;
}

interface Ran {
  readonly requirement?: string;
  readonly status?: string;
  readonly file?: string;
}

/** Vitest's JSON report as a cached run from another checkout would have it. */
function resultFile(directory: string, tests: readonly Ran[]): string {
  const byFile = new Map<string, Ran[]>();
  for (const ran of tests) {
    const file = ran.file ?? testFile;
    byFile.set(file, [...(byFile.get(file) ?? []), ran]);
  }
  const testResults = [...byFile].map(([file, results]) => ({
    name: `/elsewhere/checkout/${directory}/${file}`,
    assertionResults: results.map((ran) => ({
      fullName: `${ran.requirement ?? "untagged"} fires`,
      status: ran.status ?? "passed",
      meta: ran.requirement === undefined ? {} : { requirement: ran.requirement },
    })),
  }));
  return JSON.stringify({ testResults });
}

function workflow(files: Record<string, string>): FixturePackage {
  return {
    directory: workflowDirectory,
    manifest: manifestFor("@halonicjs/workflow", "core"),
    files: { "src/index.ts": "export const x = 1;\n", ...files },
  };
}

function traceErrors(packages: FixturePackage[]): string[] {
  const coreOrder = ["@halonicjs/routines", "@halonicjs/workflow"];
  return runChecks(packages, { coreOrder, rules: ["trace"] }).map(
    (problem) => `${problem.file}: ${problem.message}`,
  );
}

const id = "workflow.timer-fires";
const requirementFile = `${workflowDirectory}/requirements/timer-fires.md`;
const results = (tests: readonly Ran[]): Record<string, string> => ({
  [testResultsFile]: resultFile(workflowDirectory, tests),
});

verifies("check.trace-active-needs-passing-test", () => {
  test("passes when an active requirement has a test that ran and passed", () => {
    const pkg = workflow({
      "requirements/timer-fires.md": requirementText(id),
      [testFile]: testText(id),
      ...results([{ requirement: id }]),
    });
    expect(traceErrors([pkg])).toEqual([]);
  });

  test("fails when an active requirement has no test", () => {
    const pkg = workflow({ "requirements/timer-fires.md": requirementText(id), ...results([]) });
    expect(traceErrors([pkg])).toEqual([
      `${requirementFile}: The active requirement "${id}" has no test that ran. Prove it with verifies("${id}", …) tests, and run them.`,
    ]);
  });

  test("fails when its tests ran but none passed", () => {
    const pkg = workflow({
      "requirements/timer-fires.md": requirementText(id),
      [testFile]: testText(id),
      ...results([
        { requirement: id, status: "failed" },
        { requirement: id, status: "skipped" },
      ]),
    });
    expect(traceErrors([pkg]).join("\n")).toMatch(/has tests, but none of them passed/);
  });

  test("lets draft and retired requirements go without tests", () => {
    const pkg = workflow({
      "requirements/timer-fires.md": requirementText(id, "draft"),
      "requirements/old-timer.md": requirementText("workflow.old-timer", "retired"),
      ...results([]),
    });
    expect(traceErrors([pkg])).toEqual([]);
  });
});

verifies("check.trace-tests-name-live-requirements", () => {
  test("fails on a test that names a missing requirement", () => {
    const pkg = workflow({ [testFile]: testText(id), ...results([{ requirement: id }]) });
    expect(traceErrors([pkg])).toEqual([
      `${workflowDirectory}/${testFile}: verifies("${id}") names the requirement "${id}", which doesn't exist. Add its requirements/<name>.md file, or fix the ID.`,
    ]);
  });

  test("fails on a test that names a retired requirement", () => {
    const pkg = workflow({
      "requirements/timer-fires.md": requirementText(id, "retired"),
      [testFile]: testText(id),
      ...results([{ requirement: id }]),
    });
    expect(traceErrors([pkg]).join("\n")).toMatch(/names the retired requirement/);
  });

  test("fails on an ID that isn't a plain string", () => {
    const text = testText(id).replace(`verifies("${id}"`, "verifies(someId");
    const pkg = workflow({ [testFile]: text, ...results([]) });
    expect(traceErrors([pkg]).join("\n")).toMatch(/needs the requirement ID as a plain string/);
  });

  test("finds verifies under another name, and tagged tests the source scan can't see", () => {
    const aliased = testText(id).replace("{ verifies }", "{ verifies as proves }");
    const renamed = aliased.replace(`verifies("${id}"`, `proves("${id}"`);
    expect(traceErrors([workflow({ [testFile]: renamed, ...results([]) })]).join("\n")).toMatch(
      /verifies\("workflow.timer-fires"\) names the requirement/,
    );
    const hidden = workflow({
      "src/hidden.test.ts": 'import { test } from "vitest";\n',
      ...results([{ requirement: "workflow.nowhere", file: "src/hidden.test.ts" }]),
    });
    expect(traceErrors([hidden])).toEqual([
      `${workflowDirectory}/src/hidden.test.ts: The test "workflow.nowhere fires" names the requirement "workflow.nowhere", which doesn't exist. Add its requirements/<name>.md file, or fix the ID.`,
    ]);
  });
});

verifies("check.trace-tests-must-run", () => {
  test("fails on a verifies() whose tests are not in the result file", () => {
    const pkg = workflow({
      "requirements/timer-fires.md": requirementText(id),
      [testFile]: testText(id),
      "src/never-collected.test.ts": testText(id),
      ...results([{ requirement: id }]),
    });
    expect(traceErrors([pkg])).toEqual([
      `${workflowDirectory}/src/never-collected.test.ts: verifies("${id}") never ran: its tests are not in the package's result file. Check that the package's vitest.config.ts collects this file, and run the tests again.`,
    ]);
  });

  test("fails on a package with tests but no result file", () => {
    const pkg = workflow({
      "requirements/timer-fires.md": requirementText(id),
      [testFile]: testText(id),
    });
    const errors = traceErrors([pkg]);
    expect(errors).toContain(
      `${workflowDirectory}/${testResultsFile}: @halonicjs/workflow has tests but no result file. Run its tests first: pnpm verify, or pnpm turbo run test --filter @halonicjs/workflow.`,
    );
    expect(errors.join("\n")).not.toMatch(/never ran/);
  });

  test("fails on a corrupt result file instead of stopping", () => {
    const pkg = workflow({
      "requirements/timer-fires.md": requirementText(id),
      [testFile]: testText(id),
      [testResultsFile]: '{"testResults": [',
    });
    const errors = traceErrors([pkg]);
    expect(errors).toContainEqual(
      expect.stringMatching(
        /^packages\/core\/workflow\/test-results\/vitest\.json: @halonicjs\/workflow's result file can't be read: it isn't valid JSON \(.+\)\. Delete it and run the package's tests again\.$/,
      ),
    );
    expect(errors.join("\n")).not.toMatch(/never ran/);
  });
});

verifies("check.trace-rejects-malformed-requirements", () => {
  test("fails on a malformed requirement file, with the line", () => {
    const broken = requirementText(id).replace("Status: active", "Status: done");
    const pkg = workflow({ "requirements/timer-fires.md": broken, ...results([]) });
    expect(traceErrors([pkg])).toEqual([
      `${requirementFile}: Malformed requirement file: Status "done" is not one of draft, active, retired.`,
    ]);
  });
});

verifies("check.trace-ids-unique", () => {
  test("fails when the same ID is in two places", () => {
    const routinesId = "routines.runs-on-schedule";
    const core: FixturePackage = {
      directory: "packages/core/routines",
      manifest: manifestFor("@halonicjs/routines", "core"),
      files: {
        "src/index.ts": "export const r = 1;\n",
        "requirements/runs-on-schedule.md": requirementText(routinesId, "draft"),
      },
    };
    const routinesFeature: FixturePackage = {
      directory: "packages/studio/features/routines",
      manifest: manifestFor("@halonicjs/studio-feature-routines", "studio"),
      files: {
        "src/index.ts": "export const f = 1;\n",
        "requirements/runs-on-schedule.md": requirementText(routinesId, "draft"),
      },
    };
    expect(traceErrors([core, routinesFeature])).toEqual([
      `packages/core/routines/requirements/runs-on-schedule.md: The requirement ID "${routinesId}" is also used by packages/studio/features/routines/requirements/runs-on-schedule.md. IDs are unique across the repo; rename one of them.`,
      `packages/studio/features/routines/requirements/runs-on-schedule.md: The requirement ID "${routinesId}" is also used by packages/core/routines/requirements/runs-on-schedule.md. IDs are unique across the repo; rename one of them.`,
    ]);
  });
});

describe("the result file", () => {
  test("is where the shared Vitest preset writes it", () => {
    expect(testResultsFile).toBe(presetResultsFile);
  });
});
