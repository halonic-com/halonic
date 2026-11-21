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

/** A job's top-level `key: value` line, such as its `if` or `name`. */
function field(block: string, key: string): string | undefined {
  return new RegExp(`^ {4}${key}: (.+)$`, "m").exec(block)?.[1];
}

/** The jobs that skip on a push to main when their merge group passed them. */
const skippable = ["fast", "build", "trace", "scaffold", "e2e", "docs"];

verifies("check.ci-main-skips-merged", () => {
  describe("ci.yml skips on a push to main what its merge group passed", () => {
    const jobs = jobBlocks(workflow);
    const merged = jobs.get("merged") ?? "";

    test("the lookup runs only on a push to main, on GitHub's runner, and never fails ci-ok", () => {
      expect(field(merged, "if")).toBe(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );
      expect(field(merged, "runs-on")).toBe("ubuntu-24.04");
      expect(merged).toContain(
        'full() { echo "::notice title=Full run::$1, so every job runs."; exit 0; }',
      );
      const ciOk = jobs.get("ci-ok") ?? "";
      expect(ciOk).toContain("        fast,\n");
      expect(ciOk).not.toMatch(/^ {8}merged,$/m);
    });

    test("only the server jobs it lists skip, each still running unless the lookup names it", () => {
      for (const [job, block] of jobs) {
        if (job === "merged") continue;
        const condition = field(block, "if") ?? "";
        if (!skippable.includes(job)) {
          expect(block, job).not.toContain("needs.merged");
          continue;
        }
        expect(condition.startsWith("${{ !cancelled() && "), job).toBe(true);
        expect(condition, job).toContain(`!contains(needs.merged.outputs.passed, ' ${job} ')`);
      }
    });

    test("the lookup matches each skippable job by its own name", () => {
      for (const job of skippable.filter((key) => key !== "trace")) {
        const name = (field(jobs.get(job) ?? "", "name") ?? "").replace(/ \(\$\{\{.*$/, "");
        expect(merged, job).toContain(`${job}: "${name}"`);
      }
      const traceName = field(jobs.get("trace") ?? "", "name") ?? "";
      expect(merged).toContain(`ok("${traceName}")`);
    });
  });
});
