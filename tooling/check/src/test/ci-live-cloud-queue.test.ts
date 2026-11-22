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

interface QueueEntry {
  readonly head: string;
  readonly base: string;
  readonly pr: number;
  readonly fork?: boolean;
}

/** Writes an executable stand-in for `name` into `folder`. */
function stub(folder: string, name: string, lines: readonly string[]): void {
  writeFileSync(join(folder, name), ["#!/usr/bin/env bash", ...lines, ""].join("\n"));
  chmodSync(join(folder, name), 0o755);
}

/**
 * Runs live-cloud.yml's "Fork pull requests in the group" step for the group
 * `sha`, with a stand-in `gh` that answers the merge queue's `entries` and a
 * stand-in `git` whose `main` holds the commits `onMain`, and returns the
 * `forks` it wrote.
 */
function groupForks(sha: string, entries: readonly QueueEntry[], onMain = ["main0"]): string {
  const folder = mkdtempSync(join(tmpdir(), "live-cloud-group-"));
  folders.push(folder);
  stub(folder, "git", [
    'if [ "$1" = merge-base ]; then',
    `  case " ${onMain.join(" ")} " in *" $3 "*) exit 0 ;; *) exit 1 ;; esac`,
    "fi",
  ]);
  const nodes = entries.map((entry) => ({
    headCommit: { oid: entry.head },
    baseCommit: { oid: entry.base },
    pullRequest: { number: entry.pr, isCrossRepository: entry.fork ?? false },
  }));
  writeFileSync(
    join(folder, "entries.json"),
    JSON.stringify({ data: { repository: { mergeQueue: { entries: { nodes } } } } }),
  );
  stub(folder, "gh", [`cat "${join(folder, "entries.json")}"`]);
  const output = join(folder, "output.txt");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-e", "-c", stepScript(live, "Fork pull requests in the group")], {
    encoding: "utf8",
    env: {
      PATH: `${folder}:${process.env["PATH"] ?? ""}`,
      REPO: "acme/halonic",
      GROUP_SHA: sha,
      RUNNER_TEMP: folder,
      GITHUB_OUTPUT: output,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(output, "utf8").trim();
}

/**
 * Runs live-cloud.yml's "Decide" step for a merge group that changes a cloud
 * path, with the fork step's answer `forks`, and returns its exit status,
 * output and the outputs it wrote.
 */
function decideGroup(forks: string): { status: number | null; output: string; written: string } {
  const folder = mkdtempSync(join(tmpdir(), "live-cloud-decide-"));
  folders.push(folder);
  stub(folder, "gh", ["echo true"]);
  stub(folder, "git", ['if [ "$1" = worktree ]; then mkdir -p "$4"; fi']);
  stub(folder, "node", ["echo affected=true"]);
  const output = join(folder, "output.txt");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-e", "-c", stepScript(live, "Decide")], {
    encoding: "utf8",
    env: {
      PATH: `${folder}:${process.env["PATH"] ?? ""}`,
      ENABLED: "true",
      EVENT: "merge_group",
      REPO: "acme/halonic",
      GROUP_BASE: "g1",
      GROUP_FORKS: forks,
      RUNNER_TEMP: folder,
      GITHUB_OUTPUT: output,
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    written: readFileSync(output, "utf8"),
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
      expect(plan).toContain("grep -qx 'on-pull-request=true'");
    });

    test("a merge group never gets the token while it holds a fork's code", () => {
      const queue: QueueEntry[] = [
        { head: "g1", base: "main0", pr: 11 },
        { head: "g2", base: "g1", pr: 12, fork: true },
        { head: "g3", base: "g2", pr: 13 },
      ];
      // The fork's own group, and a cloud change queued behind it.
      expect(groupForks("g2", queue)).toBe("forks=#12");
      expect(groupForks("g3", queue)).toBe("forks=#12");
      // Ahead of the fork, the group holds only this repository's code.
      expect(groupForks("g1", queue)).toBe("forks=none");
      // A group the queue doesn't list counts as holding a fork.
      expect(groupForks("gone", queue)).toBe("forks=unknown");
      // A fork ahead that left the queue without merging is unlisted, but
      // its code is still in the groups built on it, which main doesn't hold.
      const dropped: QueueEntry[] = [{ head: "g2", base: "g1", pr: 12 }];
      expect(groupForks("g2", dropped, ["main0"])).toBe("forks=unknown");
      expect(groupForks("g2", dropped, ["main0", "g1"])).toBe("forks=none");
      const plan = stepScript(live, "Decide");
      expect(plan).toContain('node "$RUNNER_TEMP/base/$script" --base "$GROUP_BASE"');
    });

    test("a cloud merge group with a fork's code fails before any job gets the token", () => {
      for (const forks of ["#12", "unknown", ""]) {
        const run = decideGroup(forks);
        expect(run.status, run.output).toBe(1);
        expect(run.written).not.toContain("live=true");
      }
      const run = decideGroup("none");
      expect(run.status, run.output).toBe(0);
      expect(run.written).toContain("live=true");
    });

    test("a dropped merge group stops its live run too", () => {
      const watch = stepScript(ci, "Watch the other jobs");
      expect(watch).toContain("live-cloud.yml/runs?head_sha=$HEAD_SHA&event=merge_group");
      expect(watch).not.toMatch(/^ {6}gh run cancel "\$RUN_ID"/m);
    });
  });
});
