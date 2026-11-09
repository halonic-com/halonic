import { describe, expect, it } from "vitest";
import { defaultCoverageFloors } from "../lib/coverage.ts";
import { startersPath } from "../rules/process-starts.ts";
import { type FixturePackage, manifestFor, runChecks } from "./fixture-repo.ts";

const launcher = "packages/adapters/launcher/src/launch.ts";
const launcherTest = "packages/adapters/launcher/src/launch.test.ts";

/** A Node adapter whose files are given; tests add the process-starting import. */
function adapter(files: Record<string, string>): FixturePackage {
  return {
    directory: "packages/adapters/launcher",
    manifest: manifestFor("@halonicjs/adapter-launcher", "adapters", {
      halonic: {
        layer: "adapters",
        owner: "mateo",
        runtime: "node",
        coverage: defaultCoverageFloors.adapters,
      },
    }),
    files: { "src/index.ts": "export const x = 1;\n", ...files },
  };
}

const startsChild = 'import { spawn } from "node:child_process";\nexport const run = spawn;\n';
const scriptsTest = 'import { it } from "vitest";\nit("never starts scripts/", () => {});\n';

/** The text of `process-starters.json` with these entries. */
function starters(entries: Record<string, unknown>): string {
  return JSON.stringify({ starters: entries });
}

/** The process-starts errors for these packages and this allow-list, as "file: message". */
function problems(packages: FixturePackage[], list?: string): string[] {
  return runChecks(packages, {
    rules: ["process-starts"],
    ...(list === undefined ? {} : { extraFiles: { [startersPath]: list } }),
  }).map((problem) => `${problem.file}: ${problem.message}`);
}

const validEntry = { reason: "Starts the stdio connector.", scriptsTest: launcherTest };

describe("tooling/check: process-starts", () => {
  it("flags an adapter file that imports node:child_process without an entry", () => {
    const found = problems([adapter({ "src/launch.ts": startsChild })]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`${launcher}: imports "node:child_process"`);
    expect(found[0]).toContain('"reason"');
    expect(found[0]).toContain('"scriptsTest"');
    expect(found[0]).toContain("Liam's review");
  });

  it("catches worker_threads and cluster too", () => {
    const found = problems([
      adapter({
        "src/launch.ts": 'import { Worker } from "worker_threads";\nexport const w = Worker;\n',
        "src/fork.ts": 'import cluster from "node:cluster";\nexport const c = cluster;\n',
      }),
    ]);
    expect(found).toHaveLength(2);
    expect(found.some((line) => line.includes('imports "worker_threads"'))).toBe(true);
    expect(found.some((line) => line.includes('imports "node:cluster"'))).toBe(true);
  });

  it("counts a load the check can't follow as a process start, outside the followed layers too", () => {
    const found = problems([
      adapter({
        "src/builtin.ts":
          'export const run = () =>\n  process.getBuiltinModule("node:child_process").spawnSync("sh");\n',
        "src/computed.ts":
          'const name = ["child", "process"].join("_");\nexport const load = () => import(name);\n',
        "src/types.ts": '/// <reference types="node" />\nexport const t = 1;\n',
      }),
    ]);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain(
      "packages/adapters/launcher/src/builtin.ts: uses getBuiltinModule, which can start a process",
    );
    expect(found[1]).toContain(
      "packages/adapters/launcher/src/computed.ts: uses import() with a computed module name",
    );
  });

  it("doesn't exempt tool config files, which shipped code could import", () => {
    const found = problems([
      adapter({ "vitest.config.ts": 'export { spawnSync } from "node:child_process";\n' }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(
      'packages/adapters/launcher/vitest.config.ts: imports "node:child_process"',
    );
  });

  it("stops shipped code reaching a test file's process start through a config file", () => {
    const chain = adapter({
      "src/go.ts": 'export { run } from "../vitest.config.ts";\n',
      "vitest.config.ts": 'export { run } from "./src/sneak.test.ts";\n',
      "src/sneak.test.ts": startsChild,
    });
    const found = runChecks([chain], { rules: ["layers"] }).map(
      (problem) => `${problem.file}: ${problem.message}`,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(
      'packages/adapters/launcher/src/go.ts: "../vitest.config.ts" is a tool config file',
    );
  });

  it("lets a listed file start processes", () => {
    const pkg = adapter({ "src/launch.ts": startsChild, "src/launch.test.ts": scriptsTest });
    expect(problems([pkg], starters({ [launcher]: validEntry }))).toEqual([]);
  });

  it("exempts test files and testing packages", () => {
    const testing: FixturePackage = {
      directory: "packages/testing/parity",
      manifest: manifestFor("@halonicjs/testing-parity", "testing"),
      files: { "src/index.ts": startsChild },
    };
    const withTest = adapter({ "src/launch.test.ts": startsChild });
    expect(problems([testing, withTest])).toEqual([]);
  });

  it("flags a stale entry", () => {
    const pkg = adapter({ "src/launch.ts": "export const run = 1;\n", "src/launch.test.ts": "" });
    const missing = { "packages/adapters/launcher/src/gone.ts": validEntry };
    const found = problems([pkg], starters({ [launcher]: validEntry, ...missing }));
    expect(found).toHaveLength(2);
    expect(found[0]).toContain("no longer imports");
    expect(found[1]).toContain("doesn't exist");
  });

  it("flags an entry with an empty reason", () => {
    const pkg = adapter({ "src/launch.ts": startsChild, "src/launch.test.ts": scriptsTest });
    const found = problems([pkg], starters({ [launcher]: { ...validEntry, reason: " " } }));
    expect(found).toEqual([
      `${startersPath}: starters["${launcher}"] needs a reason. See docs/guides/checks.md (process-starts).`,
    ]);
  });

  it("flags a scriptsTest that is missing or not a test file", () => {
    const pkg = adapter({ "src/launch.ts": startsChild });
    const missing = problems([pkg], starters({ [launcher]: validEntry }));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain(`scriptsTest "${launcherTest}" must be an existing test file`);
    const notATest = problems(
      [pkg],
      starters({
        [launcher]: { ...validEntry, scriptsTest: "packages/adapters/launcher/src/index.ts" },
      }),
    );
    expect(notATest).toHaveLength(1);
    expect(notATest[0]).toContain("must be an existing test file");
  });

  it("reports one error for a malformed allow-list", () => {
    const pkg = adapter({});
    expect(problems([pkg], "not json")).toEqual([
      `${startersPath}: the file isn't valid JSON. See docs/guides/checks.md (process-starts).`,
    ]);
    const extraKey = starters({ [launcher]: { ...validEntry, approvedBy: "x" } });
    const unknownKey = problems([pkg], extraKey);
    expect(unknownKey).toHaveLength(1);
    expect(unknownKey[0]).toContain('"approvedBy" is not a known key');
    expect(problems([pkg], JSON.stringify({ starters: {}, extra: 1 }))[0]).toContain(
      '"extra" is not a known key',
    );
  });
});
