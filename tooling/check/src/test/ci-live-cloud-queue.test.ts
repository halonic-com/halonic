import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";

const workflows = new URL("../../../../.github/workflows/", import.meta.url);
const ci = readFileSync(new URL("ci.yml", workflows), "utf8");
const live = readFileSync(new URL("live-cloud.yml", workflows), "utf8");

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

interface GateRun {
  readonly status: number | null;
  readonly output: string;
  readonly calls: string;
}

/**
 * Runs CI's "Wait for the live suites" step with a stand-in `gh` that lists
 * one completed live-cloud run whose `live-cloud` job ended as `conclusion`.
 */
function gate(env: Record<string, string>, conclusion: string): GateRun {
  const folder = mkdtempSync(join(tmpdir(), "ci-live-cloud-"));
  folders.push(folder);
  const calls = join(folder, "calls.txt");
  writeFileSync(
    join(folder, "gh"),
    [
      "#!/usr/bin/env bash",
      `echo "$*" >> "${calls}"`,
      'case "$*" in',
      '  *"/runs?"*) echo "101 completed" ;;',
      `  *"/runs/101/jobs"*) echo "${conclusion}" ;;`,
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(join(folder, "gh"), 0o755);
  writeFileSync(calls, "");
  const result = spawnSync("bash", ["-e", "-c", stepScript(ci, "Wait for the live suites")], {
    encoding: "utf8",
    env: {
      PATH: `${folder}:${process.env["PATH"] ?? ""}`,
      ENABLED: "true",
      REPO: "acme/halonic",
      HEAD_REPO: "acme/halonic",
      DRAFT: "false",
      PR: "7",
      PR_SHA: "aaa111",
      GROUP_SHA: "bbb222",
      ...env,
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: readFileSync(calls, "utf8"),
  };
}

verifies("check.live-cloud-queue", () => {
  describe("the live cloud suites run in the merge queue", () => {
    test("a pull request that changes only a shared cloud path doesn't wait for them", () => {
      const run = gate({ EVENT: "pull_request", ON_PULL_REQUEST: "false" }, "failure");
      expect(run.status).toBe(0);
      expect(run.output).toContain("run in the merge queue");
      expect(run.calls).toBe("");
    });

    test("a pull request that changes what they exercise still needs a pass on its head", () => {
      const failed = gate({ EVENT: "pull_request", ON_PULL_REQUEST: "true" }, "failure");
      expect(failed.status).toBe(1);
      expect(failed.calls).toContain("head_sha=aaa111&event=pull_request");
      expect(gate({ EVENT: "pull_request", ON_PULL_REQUEST: "true" }, "success").status).toBe(0);
    });

    test("a fork's pull request that changes any cloud path still fails", () => {
      const run = gate(
        { EVENT: "pull_request", ON_PULL_REQUEST: "false", HEAD_REPO: "someone/halonic" },
        "success",
      );
      expect(run.status).toBe(1);
      expect(run.output).toContain("a fork never gets the test account's token");
    });

    test("a merge group needs a pass on its own commit", () => {
      const passed = gate({ EVENT: "merge_group" }, "success");
      expect(passed.status).toBe(0);
      expect(passed.calls).toContain("head_sha=bbb222&event=merge_group");
      const failed = gate({ EVENT: "merge_group" }, "failure");
      expect(failed.status).toBe(1);
      expect(failed.output).toContain("didn't pass on its commit bbb222");
    });

    test("live-cloud.yml runs them for a merge group that changes a cloud path", () => {
      expect(live).toMatch(/^ {2}merge_group:$/m);
      const plan = stepScript(live, "Decide");
      expect(plan).toContain('cloud-affected.ts --base "$GROUP_BASE"');
      expect(plan).toContain("grep -qx 'on-pull-request=true'");
    });

    test("a dropped merge group stops its live run too", () => {
      const watch = stepScript(ci, "Watch the other jobs");
      expect(watch).toContain("live-cloud.yml/runs?head_sha=$HEAD_SHA&event=merge_group");
      expect(watch).not.toMatch(/^ {6}gh run cancel "\$RUN_ID"/m);
    });
  });
});
