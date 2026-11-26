import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

/** One job's lines in ci.yml, from its key to the next job's. */
function jobBlock(text: string, key: string): string {
  const jobs = text.slice(text.indexOf("\njobs:\n"));
  const start = jobs.indexOf(`\n  ${key}:\n`);
  if (start === -1) return "";
  const next = /\n {2}[a-z][a-z0-9-]*:\n/g;
  next.lastIndex = start + 1;
  const end = next.exec(jobs)?.index ?? jobs.length;
  return jobs.slice(start, end);
}

/** The shard names of a workflow-level `env` list, such as BUILD_SHARDS, in order. */
function shardNames(text: string, list: string): string[] {
  const block = new RegExp(`^ {2}${list}: \\|\\n((?: {4}\\S.*\\n)+)`, "m").exec(text)?.[1] ?? "";
  return block
    .split("\n")
    .map((line) => line.trim().split(" ")[0] ?? "")
    .filter((name) => name !== "");
}

/** The build matrix's two shard lists: the pull request's, then everything else's. */
function matrixLists(build: string): string[][] {
  const expression = /^ {8}shard: \$\{\{ fromJSON\((.+)\) \}\}$/m.exec(build)?.[1] ?? "";
  return [...expression.matchAll(/'(\[[^']*\])'/g)].map((match) => JSON.parse(match[1] ?? "[]"));
}

verifies("check.ci-queue-build-shards", () => {
  describe("ci.yml builds in fewer shards in the merge queue and on a push", () => {
    const build = jobBlock(workflow, "build");
    const pullRequest = shardNames(workflow, "BUILD_SHARDS");
    const queue = shardNames(workflow, "QUEUE_BUILD_SHARDS");

    test("a pull request runs BUILD_SHARDS, anything else the three to five of QUEUE_BUILD_SHARDS", () => {
      expect(build).toContain("github.event_name == 'pull_request' && '[");
      expect(matrixLists(build)).toEqual([pullRequest, queue]);
      expect(pullRequest).toHaveLength(9);
      expect(queue.length).toBeGreaterThanOrEqual(3);
      expect(queue.length).toBeLessThanOrEqual(5);
    });

    test("app-studio keeps its own shard and test workers in both lists", () => {
      expect(pullRequest).toContain("app-studio");
      expect(queue).toContain("app-studio");
      expect(build).toContain('          - shard: app-studio\n            test-workers: "6"');
    });

    test("outside a pull request the build job's steps read the queue's list", () => {
      expect(build).toContain("        if: github.event_name != 'pull_request'");
      expect(build).toContain(
        'echo "BUILD_SHARDS<<SHARDS_END"\n            echo "$QUEUE_BUILD_SHARDS"',
      );
    });

    test("a pull request checks that both lists hold every package once", () => {
      expect(build).toContain('shards=$(covers BUILD_SHARDS "$BUILD_SHARDS")');
      expect(build).toContain('covers QUEUE_BUILD_SHARDS "$QUEUE_BUILD_SHARDS" > /dev/null');
    });

    test("trace and the reuse of main's results read the queue's names; the guard the pull request's", () => {
      expect(jobBlock(workflow, "trace")).toContain('<<< "$QUEUE_BUILD_SHARDS"');
      const baseTests = jobBlock(workflow, "base-tests");
      expect(baseTests).toContain('<<< "$QUEUE_BUILD_SHARDS"');
      expect(baseTests).not.toContain('<<< "$BUILD_SHARDS"');
      const guard = jobBlock(workflow, "guard");
      expect(guard).toContain('<<< "$BUILD_SHARDS"');
      expect(guard).not.toContain("QUEUE_BUILD_SHARDS");
    });
  });
});
