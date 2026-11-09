import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import type { CliCall } from "./cli-calls.ts";
import type { OldResult } from "./recording.ts";
import { fakeOldRepo } from "./test/fake-old-repo.ts";
import { TestFolders } from "./test-folders.ts";

// The tests start git and Node processes, which can take longer than 5 s on a busy machine.
vi.setConfig({ testTimeout: 30_000 });

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

interface Job {
  readonly id: string;
  readonly files: Readonly<Record<string, string>>;
  readonly tests?: boolean;
  readonly cli?: readonly CliCall[];
}

/**
 * Runs old-runner.ts in this process, the way the recorder starts it, so its
 * work counts towards coverage. Each run loads the runner and the old modules
 * afresh.
 */
async function runOld(clone: string, jobs: readonly Job[]): Promise<OldResult[]> {
  const scratch = folders.make();
  const written = jobs.map((job) => {
    const dir = join(scratch, job.id);
    mkdirSync(dir);
    folders.write(dir, job.files);
    return {
      id: job.id,
      dir,
      files: Object.keys(job.files).sort(),
      tests: job.tests,
      cli: job.cli,
    };
  });
  const jobsPath = join(scratch, "jobs.json");
  const outPath = join(scratch, "results.json");
  const home = join(scratch, "home");
  mkdirSync(home);
  writeFileSync(jobsPath, JSON.stringify(written));
  const argv = process.argv;
  process.argv = [argv[0] ?? "node", "old-runner.ts", clone, jobsPath, outPath, home];
  try {
    vi.resetModules();
    await import("./old-runner.ts");
  } finally {
    process.argv = argv;
  }
  return JSON.parse(readFileSync(outPath, "utf8")) as OldResult[];
}

verifies("parity.runner-traces-old-loader", () => {
  it("records the schema, issues with lines and the old validate for each file", async () => {
    const { clone } = fakeOldRepo(folders);
    const [result] = await runOld(clone, [
      {
        id: "flat",
        files: {
          "workspace.yaml": "id: acme\nport: BAD\nmode: QUIET\n",
          "agent.yaml": "root: BAD\n",
          "notes.txt": "not a definition\n",
        },
      },
    ]);
    expect(result?.id).toBe("flat");
    expect(result?.diagnostics).toEqual([
      {
        severity: "error",
        path: "workspace.yaml",
        message: "port: Expected a number",
        line: 2,
        col: 3,
      },
      { severity: "error", path: "agent.yaml", message: "Expected a number" },
      { severity: "warning", path: "models.yaml", message: "file is missing" },
    ]);
    expect(result?.files).toEqual([
      {
        file: "agent.yaml",
        flatPath: "agent.yaml",
        read: true,
        schema: "agent",
        issues: [{ path: [], code: "invalid_type", message: "Expected a number" }],
      },
      { file: "notes.txt", flatPath: "notes.txt", read: false, schema: null, issues: [] },
      {
        file: "workspace.yaml",
        flatPath: "workspace.yaml",
        read: true,
        schema: "workspace",
        issues: [
          { path: ["port"], code: "invalid_type", message: "Expected a number", line: 2, col: 3 },
          { path: ["mode"], code: "custom", message: "Not reported" },
        ],
      },
    ]);
  });

  it("runs the old validate on the workspace with the old repo's tsx", async () => {
    const { clone } = fakeOldRepo(folders);
    const [result] = await runOld(clone, [
      { id: "flat", files: { "workspace.yaml": "id: acme\n" } },
    ]);
    expect(result?.validate.exitCode).toBe(1);
    expect(result?.validate.stdout).toMatch(/^checked \/.*\/flat\n$/);
    expect(result?.validate.stderr).toBe("1 problem\n");
  });

  it("maps grouped and legacy-grouped files to the loader's flat paths", async () => {
    const { clone } = fakeOldRepo(folders);
    const [grouped, legacy] = await runOld(clone, [
      { id: "grouped", files: { "grouped/workspace.yaml": "id: ::: broken\n" } },
      { id: "legacy", files: { "legacy/agent.yaml": "name: helper\n" } },
    ]);
    expect(grouped?.files).toEqual([
      {
        file: "grouped/workspace.yaml",
        flatPath: "workspace.yaml",
        read: true,
        schema: null,
        issues: [],
      },
    ]);
    expect(grouped?.diagnostics).toContainEqual({
      severity: "error",
      path: "workspace.yaml",
      message: "bad YAML",
      line: 1,
      col: 1,
    });
    expect(legacy?.files).toEqual([
      {
        file: "legacy/agent.yaml",
        flatPath: "agent.yaml",
        read: true,
        schema: "agent",
        issues: [],
      },
    ]);
  });

  it("starts each workspace with no reads or schema results from the one before", async () => {
    const { clone } = fakeOldRepo(folders);
    const [first, second] = await runOld(clone, [
      { id: "first", files: { "agent.yaml": "name: BAD\n" } },
      { id: "second", files: { "workspace.yaml": "id: acme\n" } },
    ]);
    expect(first?.files[0]?.issues).toHaveLength(1);
    expect(second?.files).toEqual([
      {
        file: "workspace.yaml",
        flatPath: "workspace.yaml",
        read: true,
        schema: "workspace",
        issues: [],
      },
    ]);
  });

  it("stops when the old code lacks an export, naming it", async () => {
    const { clone } = fakeOldRepo(folders, ["Hub"]);
    await expect(runOld(clone, [])).rejects.toThrow(
      'The old code has no export "Hub"; is the clone at the reference commit?',
    );
  });
});

verifies("parity.runner-records-test-run-logs", () => {
  const at = "2026-01-01T00:00:00.000Z";
  const wall = Date.parse(at);

  it("records each test case's runs in order, with fixed IDs and a clock that stands still", async () => {
    const { clone } = fakeOldRepo(folders);
    const realNow = Date.now;
    const [result] = await runOld(clone, [
      {
        id: "base",
        files: { "workspace.yaml": "id: acme\n", "tests.yaml": "plain\nnested\nbroken\n" },
        tests: true,
      },
    ]);
    expect(Date.now).toBe(realNow);
    expect(result?.tests).toEqual([
      {
        hub: "acme",
        workflow: "greet",
        name: "plain",
        passed: true,
        failures: [],
        runId: "test_1",
        runs: [
          {
            id: "test_1",
            summary: { id: "test_1", events: 1 },
            events: [{ type: "run.started", kind: "greet", runId: "test_1", at, wall }],
          },
        ],
      },
      {
        hub: "acme",
        workflow: "greet",
        name: "nested",
        passed: true,
        failures: [],
        runId: "test_1",
        runs: [
          {
            id: "test_1",
            summary: { id: "test_1", events: 1 },
            events: [{ type: "run.started", kind: "greet", runId: "test_1", at, wall }],
          },
          {
            id: "test_2",
            summary: { id: "test_2", events: 1 },
            events: [{ type: "run.started", kind: "child", runId: "test_2", at, wall }],
          },
        ],
      },
      expect.objectContaining({
        name: "broken",
        passed: false,
        failures: ["expected status completed"],
      }),
    ]);
  });

  it("runs no workflow tests for a job that doesn't ask for them", async () => {
    const { clone } = fakeOldRepo(folders);
    const [result] = await runOld(clone, [{ id: "case", files: { "tests.yaml": "plain\n" } }]);
    expect(result).not.toHaveProperty("tests");
    expect(result).not.toHaveProperty("cli");
  });

  it("stops, naming the test, when a run log changes between two runs", async () => {
    const { clone } = fakeOldRepo(folders);
    const realNow = Date.now;
    await expect(
      runOld(clone, [{ id: "base", files: { "tests.yaml": "plain\nrandom\n" }, tests: true }]),
    ).rejects.toThrow(
      'The run log of acme/greet "random" changed between two runs; fix the clock or IDs first',
    );
    expect(Date.now).toBe(realNow);
  });

  it("stops when the old loader gives no workspace to test", async () => {
    const { clone } = fakeOldRepo(folders);
    await expect(
      runOld(clone, [{ id: "base", files: { "workspace.yaml": "id: acme\n" }, tests: true }]),
    ).rejects.toThrow("The old loader gave no workspace, so its workflow tests can't run");
  });
});

verifies("parity.runner-records-cli-output", () => {
  it("runs the old CLI calls a job asks for", async () => {
    const { clone } = fakeOldRepo(folders);
    const [result] = await runOld(clone, [
      {
        id: "base",
        files: { "workspace.yaml": "id: acme\n" },
        cli: [{ name: "run", args: ["run", "<workspace>"] }],
      },
    ]);
    expect(result?.cli?.map((call) => [call.name, call.exitCode, call.runs.length])).toEqual([
      ["run", 0, 1],
    ]);
  });
});
