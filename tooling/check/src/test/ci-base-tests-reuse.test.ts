import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";

const ci = readFileSync(new URL("../../../../.github/workflows/ci.yml", import.meta.url), "utf8");
const job = ci.slice(ci.indexOf("  base-tests:\n"), ci.indexOf("  guard:\n"));
const stepName = "Reuse main's test results for the merge base";
const repo = "acme/halonic";

/** The shell script of the first step with this name, from its `run: |` block. */
function stepScript(text: string, name: string): string {
  const start = text.indexOf(`name: ${name}\n`);
  const lines = text.slice(start).split("\n");
  const body = lines.slice(lines.indexOf("        run: |") + 1);
  const end = body.findIndex((line) => line !== "" && !line.startsWith("          "));
  return body
    .slice(0, end)
    .map((line) => line.slice(10))
    .join("\n");
}

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function tempFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), "ci-base-tests-reuse-"));
  folders.push(folder);
  return folder;
}

/** Writes an executable stand-in for `name` into `folder`. */
function stub(folder: string, name: string, lines: readonly string[]): void {
  writeFileSync(join(folder, name), ["#!/usr/bin/env bash", ...lines, ""].join("\n"));
  chmodSync(join(folder, name), 0o755);
}

/** A workflow run as GitHub's API lists it; trusted unless a field is overridden. */
function run(
  id: number,
  sha: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    path: ".github/workflows/ci.yml",
    event: "merge_group",
    head_branch: `gh-readonly-queue/main/pr-${id}-${sha}`,
    repository: { full_name: repo },
    head_repository: { full_name: repo },
    ...fields,
  };
}

/** One shard's archive: `test-results.tar` holding these files, or a link when `link` is set. */
function archive(folder: string, entries: readonly string[], link?: string): string {
  const root = mkdtempSync(join(folder, "archive-"));
  for (const entry of entries) {
    mkdirSync(join(root, dirname(entry)), { recursive: true });
    writeFileSync(join(root, entry), `{"from":"main"}`);
  }
  if (link !== undefined) {
    mkdirSync(join(root, dirname(link)), { recursive: true });
    symlinkSync("/etc/hostname", join(root, link));
  }
  const tar = join(folder, `${root.split("/").pop() ?? "archive"}.tar`);
  const packed = spawnSync(
    "tar",
    ["-cf", tar, ...(link === undefined ? entries : [...entries, link])],
    {
      cwd: root,
    },
  );
  if (packed.status !== 0) throw new Error(packed.stderr.toString());
  return tar;
}

interface Artifact {
  readonly id: number;
  readonly name: string;
  readonly run: number;
  readonly sha: string;
  readonly tar: string;
  readonly expired?: boolean;
}

interface Main {
  /** The runs GitHub lists for each commit. */
  readonly runs: Record<string, readonly Record<string, unknown>[]>;
  readonly artifacts: readonly Artifact[];
  readonly baseRef?: string;
}

interface StepRun {
  readonly status: number | null;
  readonly output: string;
  /** What the step wrote to GITHUB_OUTPUT. */
  readonly outputs: string;
  readonly workdir: string;
  /** Every `gh` call, one per line. */
  readonly calls: string;
}

/**
 * Runs the step on merge base `m0`, whose first parents are `m1` … `m20`,
 * against a stand-in GitHub API that lists `main.runs` and serves
 * `main.artifacts`, with two build shards, alpha and beta.
 */
function reuse(main: Main): StepRun {
  const folder = tempFolder();
  const api = join(folder, "api");
  mkdirSync(api);
  const key = (path: string): string => join(api, path.replace(/[/?&=]/g, "_"));
  for (const [sha, runs] of Object.entries(main.runs)) {
    writeFileSync(
      key(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&status=success&per_page=20`),
      JSON.stringify({ workflow_runs: runs }),
    );
  }
  const byRun = new Map<number, Artifact[]>();
  for (const artifact of main.artifacts) {
    byRun.set(artifact.run, [...(byRun.get(artifact.run) ?? []), artifact]);
    writeFileSync(
      key(`repos/${repo}/actions/artifacts/${artifact.id}/zip`),
      readFileSync(artifact.tar),
    );
  }
  for (const [runId, artifacts] of byRun) {
    const listed = artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      expired: artifact.expired ?? false,
      workflow_run: { id: artifact.run, head_sha: artifact.sha },
    }));
    writeFileSync(
      key(`repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`),
      JSON.stringify({ artifacts: listed }),
    );
  }
  const calls = join(folder, "calls.txt");
  writeFileSync(calls, "");
  const parents = Array.from({ length: 21 }, (_, at) => `m${at}`).join(" ");
  stub(folder, "git", [
    `if [ "$1" = rev-list ] && [ "$5" = m0 ]; then printf '%s\\n' ${parents}; exit 0; fi`,
    "exit 2",
  ]);
  stub(folder, "gh", [
    `echo "$2" >> "${calls}"`,
    `file="${api}/$(tr '/?&=' '____' <<< "$2")"`,
    'if [ -f "$file" ]; then cat "$file"; exit 0; fi',
    `case "$2" in *"/runs?head_sha="*) echo '{"workflow_runs":[]}' ;; *) exit 4 ;; esac`,
  ]);
  stub(folder, "unzip", ['[ "$1" = -p ] && [ "$3" = test-results.tar ] || exit 5', 'cat "$2"']);
  const workdir = join(folder, "checkout");
  mkdirSync(workdir);
  const outputs = join(folder, "outputs.txt");
  writeFileSync(outputs, "");
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", stepScript(ci, stepName)], {
    cwd: workdir,
    encoding: "utf8",
    env: {
      PATH: `${folder}:${process.env["PATH"] ?? ""}`,
      MERGE_BASE: "m0",
      BASE_REF: main.baseRef ?? "main",
      REPO: repo,
      GITHUB_OUTPUT: outputs,
      BUILD_SHARDS: "alpha ./packages/alpha/*\nbeta ./packages/beta/*\n",
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    outputs: readFileSync(outputs, "utf8"),
    workdir,
    calls: readFileSync(calls, "utf8"),
  };
}

const alphaFile = "packages/alpha/one/test-results/vitest.json";
const betaFile = "packages/beta/two/test-results/vitest.json";

/** Both shards' archives for run `runId` on commit `sha`. */
function shards(folder: string, runId: number, sha: string): Artifact[] {
  return [
    {
      id: runId * 10 + 1,
      name: "test-results-alpha",
      run: runId,
      sha,
      tar: archive(folder, [alphaFile]),
    },
    {
      id: runId * 10 + 2,
      name: "test-results-beta",
      run: runId,
      sha,
      tar: archive(folder, [betaFile]),
    },
  ];
}

verifies("check.base-tests-reuse-main", () => {
  describe("the merge base's tests reuse main's own results", () => {
    // The step filters GitHub's answers with jq, as the runners do; GitHub's
    // ubuntu image and our CI image both have it.
    test("jq, tar and realpath are installed, as on CI's runners", () => {
      for (const [tool, flag] of [
        ["jq", "--version"],
        ["tar", "--version"],
        ["realpath", "--version"],
      ] as const) {
        expect(spawnSync(tool, [flag]).status, `${tool} isn't installed`).toBe(0);
      }
    });

    test("a green merge-group run for the merge base supplies every shard's results, and no test runs", () => {
      const fixtures = tempFolder();
      const step = reuse({ runs: { m0: [run(7, "m0")] }, artifacts: shards(fixtures, 7, "m0") });
      expect(step.status, step.output).toBe(0);
      expect(step.outputs).toBe("sha=m0\n");
      expect(step.output).toContain("Reused the test results of main's run 7");
      expect(readFileSync(join(step.workdir, alphaFile), "utf8")).toBe(`{"from":"main"}`);
      expect(readFileSync(join(step.workdir, betaFile), "utf8")).toBe(`{"from":"main"}`);
    });

    test("a green push run to main with results is accepted too", () => {
      const fixtures = tempFolder();
      const push = run(8, "m0", { event: "push", head_branch: "main" });
      const step = reuse({ runs: { m0: [push] }, artifacts: shards(fixtures, 8, "m0") });
      expect(step.outputs).toBe("sha=m0\n");
    });

    test("results that a pull request's run, another branch, repository or workflow could have uploaded are never read", () => {
      const fixtures = tempFolder();
      const untrusted = [
        run(11, "m0", { event: "pull_request", head_branch: "main" }),
        run(12, "m0", { event: "push", head_branch: "release/halonic-0.1.1" }),
        run(13, "m0", { head_branch: "gh-readonly-queue/release/pr-13-m0" }),
        run(14, "m0", { head_repository: { full_name: "stranger/halonic" } }),
        run(15, "m0", { path: ".github/workflows/other.yml" }),
        run(16, "m0", { conclusion: "failure" }),
        run(17, "m1"),
      ];
      const artifacts = [11, 12, 13, 14, 15, 16, 17].flatMap((id) => shards(fixtures, id, "m0"));
      const step = reuse({ runs: { m0: untrusted }, artifacts });
      expect(step.status, step.output).toBe(0);
      expect(step.outputs).toBe("");
      expect(step.output).toContain("so the merge base is tested");
      expect(step.calls).not.toContain("/artifacts/");
      expect(existsSync(join(step.workdir, "packages"))).toBe(false);
    });

    test("an artifact listed for another run or commit, or expired, doesn't count, so the job walks back", () => {
      const fixtures = tempFolder();
      const [alpha, beta] = shards(fixtures, 21, "m0");
      if (alpha === undefined || beta === undefined) throw new Error("two shards");
      const step = reuse({
        runs: { m0: [run(21, "m0"), run(22, "m0")], m2: [run(23, "m2")] },
        artifacts: [
          alpha,
          { ...beta, expired: true },
          { ...alpha, id: 221, run: 22, sha: "m9" },
          { ...beta, id: 222, run: 22 },
          ...shards(fixtures, 23, "m2"),
        ],
      });
      expect(step.status, step.output).toBe(0);
      expect(step.outputs).toBe("sha=m2\n");
      expect(step.output).toContain("baseline-walked-back");
      expect(step.output).toContain(
        "Using m2, 2 commit(s) back on main, and the results of its run 23",
      );
    });

    test("an archive holding a link or an unexpected file is refused and nothing is unpacked", () => {
      const fixtures = tempFolder();
      for (const tar of [
        archive(fixtures, [alphaFile], "packages/alpha/two/test-results/vitest.json"),
        archive(fixtures, [alphaFile, "packages/alpha/one/src/index.ts"]),
      ]) {
        const [, beta] = shards(fixtures, 31, "m0");
        if (beta === undefined) throw new Error("two shards");
        const alpha = { id: 311, name: "test-results-alpha", run: 31, sha: "m0", tar };
        const step = reuse({ runs: { m0: [run(31, "m0")] }, artifacts: [beta, alpha] });
        expect(step.status, step.output).toBe(0);
        expect(step.outputs).toBe("");
        expect(step.output).toContain("Couldn't use the test results of run 31");
        expect(existsSync(join(step.workdir, "packages"))).toBe(false);
      }
    });

    test("with no results within 20 commits, or a pull request into another branch, the merge base is tested", () => {
      const fixtures = tempFolder();
      const tooOld = reuse({
        runs: { m21: [run(41, "m21")] },
        artifacts: shards(fixtures, 41, "m21"),
      });
      expect(tooOld.status, tooOld.output).toBe(0);
      expect(tooOld.outputs).toBe("");
      expect(tooOld.output).toContain("No run on main within 20 commits");

      const stacked = reuse({
        baseRef: "elena/HAL-1-stack",
        runs: { m0: [run(42, "m0")] },
        artifacts: shards(fixtures, 42, "m0"),
      });
      expect(stacked.outputs).toBe("");
      expect(stacked.calls).toBe("");
      expect(stacked.output).toContain("into elena/HAL-1-stack, not main");
    });

    test("after a reuse no dependency is installed and no test runs, and the guard gets the reused commit", () => {
      expect(job).toMatch(
        /sha: \$\{\{ steps\.reuse\.outputs\.sha \|\| steps\.walk-back\.outputs\.sha \|\| steps\.install\.outputs\.sha \}\}/,
      );
      const reuseAt = job.indexOf(`name: ${stepName}`);
      expect(reuseAt).toBeGreaterThan(job.indexOf("name: Switch to the merge base"));
      for (const later of [
        "name: Walk back first if the merge base's push CI run failed",
        "uses: pnpm/action-setup",
        "name: Install the merge base's dependencies",
        "name: Choose the packages to test",
        "name: Run the merge base's tests without reading any cache",
      ]) {
        const at = job.indexOf(later);
        expect(at, later).toBeGreaterThan(reuseAt);
        const step = job.slice(at, job.indexOf("\n      - ", at));
        expect(step, later).toMatch(/if: steps\.reuse\.outputs\.sha == ''/);
      }
      const walkBack = job.slice(job.indexOf("name: Walk back to main's newest green commit"));
      expect(walkBack).toMatch(/^.*\n\s+if: steps\.base-test-run\.outcome == 'failure'/);
    });
  });
});
