import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

/** Every job's lines in ci.yml, by job key. */
function jobBlocks(text: string): Map<string, string> {
  const result = new Map<string, string>();
  const jobs = text.slice(text.indexOf("\njobs:\n"));
  let job = "";
  for (const line of jobs.split("\n")) {
    const jobKey = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (jobKey?.[1]) job = jobKey[1];
    if (job) result.set(job, `${result.get(job) ?? ""}${line}\n`);
  }
  return result;
}

/** A job's top-level `key: value` line, such as its `if`. */
function field(block: string, key: string): string | undefined {
  return new RegExp(`^ {4}${key}: (.+)$`, "m").exec(block)?.[1];
}

/** The shard names in the workflow's BUILD_SHARDS list. */
function shards(text: string): string[] {
  const start = text.indexOf("BUILD_SHARDS: |\n");
  const lines = text.slice(start).split("\n").slice(1);
  const names: string[] = [];
  for (const line of lines) {
    const match = /^ {4}([a-z][a-z0-9-]*) /.exec(line);
    if (!match?.[1]) break;
    names.push(match[1]);
  }
  return names;
}

verifies("check.ci-pr-turbo-cache", () => {
  describe("ci.yml copies main's Turbo results for pull requests", () => {
    const jobs = jobBlocks(workflow);
    const copy = jobs.get("pr-turbo-cache") ?? "";
    const build = jobs.get("build") ?? "";

    test("it runs only on a push to main", () => {
      expect(field(copy, "if")).toBe(
        `\${{ !cancelled() && github.event_name == 'push' && github.ref == 'refs/heads/main' }}`,
      );
    });

    test("it saves one entry per build shard, under the key and path the build job restores", () => {
      const names = shards(workflow);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(copy, name).toContain(`key: turbo-\${{ runner.os }}-${name}-\${{ github.sha }}`);
      }
      expect(copy.match(/actions\/cache\/save@/g)?.length).toBe(names.length);
      expect(copy).not.toMatch(/path: (?!\.turbo\/cache\n)/);
      expect(build).toContain(
        `path: .turbo/cache\n          key: turbo-\${{ runner.os }}-\${{ matrix.shard }}-\${{ github.sha }}`,
      );
    });

    test("it builds nothing and only copies from the server's disk cache", () => {
      const runs = copy.split("\n").filter((line) => line.includes("turbo run"));
      expect(runs.length).toBeGreaterThan(0);
      for (const line of runs) expect(line).toContain("--dry=json");
      expect(copy).toContain("/cache/turbo/");
    });

    test("a pull request first restores the entry of the main it was merged with", () => {
      expect(build).toContain("run: echo \"sha=$(git rev-parse HEAD^1)\" >> \"$GITHUB_OUTPUT\"");
      expect(build).toContain(
        "if: steps.turbo-dir.outputs.disk != 'true' && github.event_name == 'pull_request'",
      );
      expect(build).toContain(
        `restore-keys: |\n            \${{ steps.turbo-parent.outputs.sha && format('turbo-{0}-{1}-{2}', runner.os, matrix.shard, steps.turbo-parent.outputs.sha) || '' }}\n            turbo-\${{ runner.os }}-\${{ matrix.shard }}-\n`,
      );
      expect(build.indexOf("id: turbo-parent")).toBeLessThan(build.indexOf("id: turbo-cache"));
    });

    test("ci-ok doesn't need it", () => {
      expect(field(jobs.get("ci-ok") ?? "", "needs") ?? "").not.toContain("pr-turbo-cache");
    });
  });
});
