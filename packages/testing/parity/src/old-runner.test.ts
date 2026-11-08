import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import type { OldResult } from "./recording.ts";
import { fakeOldRepo } from "./test/fake-old-repo.ts";
import { TestFolders } from "./test-folders.ts";

const folders = new TestFolders();
afterEach(() => folders.cleanUp());

interface Job {
  readonly id: string;
  readonly files: Readonly<Record<string, string>>;
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
    return { id: job.id, dir, files: Object.keys(job.files).sort() };
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
