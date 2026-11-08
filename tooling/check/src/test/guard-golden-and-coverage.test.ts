import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checkCoverage } from "../guard/coverage.ts";
import { checkGoldenFiles } from "../guard/golden-files.ts";
import { type GuardCase, noteCovering, runGuard, workflowDirectory } from "./guard-fixture.ts";

async function errorsOf(guardCase: GuardCase): Promise<string[]> {
  const { errors } = await runGuard(guardCase);
  return errors.map((error) => error.replace(/ That needs a decision note: .*$/, ""));
}

verifies("check.guard-golden-files", () => {
  const checks = [checkGoldenFiles];
  const golden = "golden/run-log.txt";
  const goldenPath = `${workflowDirectory}/${golden}`;

  test.each([
    ["changed", { [golden]: "started\n" }, { [golden]: "started\nfinished\n" }],
    ["added", {}, { [golden]: "started\n" }],
    ["deleted", { [golden]: "started\n" }, {}],
  ])("fails when a golden file is %s", async (change, base, head) => {
    expect(await errorsOf({ base, head, checks })).toEqual([
      `${goldenPath}: The golden file ${goldenPath} was ${change}.`,
    ]);
  });

  test("treats __snapshots__ folders and .snap files as golden", async () => {
    const head = { "src/__snapshots__/timer.test.ts.snap": "exports[`a`] = `1`;\n" };
    expect(await errorsOf({ base: {}, head, checks })).toHaveLength(1);
  });

  test("fails when an inline snapshot changes", async () => {
    const snapshot = (value: string): Record<string, string> => ({
      "src/timer.test.ts": `test("a", () => { expect(1).toMatchInlineSnapshot(\`${value}\`); });\n`,
    });
    const errors = await errorsOf({ base: snapshot("1"), head: snapshot("2"), checks });
    expect(errors).toEqual([
      `${workflowDirectory}/src/timer.test.ts: ${workflowDirectory}/src/timer.test.ts changes, adds or removes an inline snapshot (1 now, 1 on the merge base).`,
    ]);
  });

  test("fails when a deleted test file takes its inline snapshots with it", async () => {
    const base = {
      "src/timer.test.ts": 'test("a", () => { expect(1).toMatchInlineSnapshot(`1`); });\n',
    };
    expect(await errorsOf({ base, head: {}, checks })).toEqual([
      `${workflowDirectory}/src/timer.test.ts: ${workflowDirectory}/src/timer.test.ts changes, adds or removes an inline snapshot (0 now, 1 on the merge base).`,
    ]);
  });

  test("passes unchanged golden files, and changes a note covers", async () => {
    const files = { [golden]: "started\n" };
    expect(await errorsOf({ base: files, head: files, checks })).toEqual([]);
    const note = noteCovering(goldenPath);
    const changed = { base: files, head: { [golden]: "finished\n" }, note, checks };
    expect(await errorsOf(changed)).toEqual([]);
  });
});

verifies("check.guard-coverage", () => {
  const checks = [checkCoverage];
  const manifestPath = `${workflowDirectory}/package.json`;
  const withFloor = (lines: number): Record<string, unknown> => ({
    name: "@halonicjs/workflow",
    halonic: { layer: "core", owner: "mateo", coverage: { lines, branches: 85 } },
  });
  const floorCase = (before: number, after: number): GuardCase => ({
    base: { "package.json": JSON.stringify(withFloor(before)) },
    head: { "package.json": JSON.stringify(withFloor(after)) },
    checks,
  });

  test("fails when a package lowers its coverage floor", async () => {
    expect(await errorsOf(floorCase(90, 80))).toEqual([
      `${manifestPath}: The coverage floor for lines in ${manifestPath} went from 90 to 80.`,
    ]);
  });

  test("passes a raised floor, or a lowered one a note covers", async () => {
    expect(await errorsOf(floorCase(90, 95))).toEqual([]);
    expect(await errorsOf({ ...floorCase(90, 80), note: noteCovering(manifestPath) })).toEqual([]);
  });

  test("fails on a new coverage-ignore comment, and points at its line", async () => {
    const head = {
      "src/index.ts": "export const x = 1;\n/* v8 ignore next */\nexport const y = 2;\n",
    };
    const { errors } = await runGuard({ base: {}, head, checks });
    expect(errors[0]).toMatch(
      new RegExp(
        `^${workflowDirectory}/src/index.ts: .* adds a coverage-ignore comment \\(1 now, 0`,
      ),
    );
  });

  test("fails when a package with a floor is deleted, and follows a moved one", async () => {
    // A second package next to the workflow package, only on the merge base.
    const timer = (folder: string): Record<string, string> => ({
      [`../${folder}/package.json`]: JSON.stringify({ ...withFloor(90), name: "@halonicjs/timer" }),
    });
    const timerManifest = "packages/core/timer/package.json";
    expect(await errorsOf({ base: timer("timer"), head: {}, checks })).toEqual([
      `${timerManifest}: ${timerManifest} was deleted, and with it the coverage floor for lines, branches.`,
    ]);
    expect(await errorsOf({ base: timer("timer"), head: timer("timers"), checks })).toEqual([]);
  });

  test("reads comments with the parser, past a regex that holds a backtick", async () => {
    const head = {
      "src/index.ts": "export const tick = /`/;\n/* v8 ignore next */\nexport const y = 2;\n",
    };
    const { errors } = await runGuard({ base: {}, head, checks });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/adds a coverage-ignore comment \(1 now, 0/);
    const template = { "src/index.ts": "export const x = `${1} // v8 ignore next`;\n" };
    expect(await errorsOf({ base: {}, head: template, checks })).toEqual([]);
  });

  test("passes ignore comments the merge base had, and the words in a string or prose", async () => {
    const ignored = { "src/index.ts": "// istanbul ignore next\nexport const x = 1;\n" };
    expect(await errorsOf({ base: ignored, head: ignored, checks })).toEqual([]);
    const text = { "src/index.ts": 'export const x = "v8 ignore";\n' };
    expect(await errorsOf({ base: {}, head: text, checks })).toEqual([]);
    const prose = { "src/index.ts": "/** Finds `c8 ignore` comments. */\nexport const x = 1;\n" };
    expect(await errorsOf({ base: {}, head: prose, checks })).toEqual([]);
  });

  test("fails when a Vitest config changes its coverage settings", async () => {
    const config = (exclude: string): Record<string, string> => ({
      "vitest.config.ts": `export default definePackageTestConfig({ test: { coverage: { exclude: [${exclude}] } } });\n`,
    });
    const errors = await errorsOf({ base: config(""), head: config('"src/timer.ts"'), checks });
    expect(errors).toEqual([
      `${workflowDirectory}/vitest.config.ts: ${workflowDirectory}/vitest.config.ts changes the coverage settings.`,
    ]);
    expect(await errorsOf({ base: config(""), head: config(""), checks })).toEqual([]);
  });
});
