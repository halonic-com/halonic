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

/** A job's top-level `key: value` line, such as its `if` or `needs`. */
function field(block: string, key: string): string | undefined {
  return new RegExp(`^ {4}${key}: (.+)$`, "m").exec(block)?.[1];
}

verifies("check.ci-guard-files-early", () => {
  describe("ci.yml runs the guard's file checks at the start of a pull request's run", () => {
    const job = jobBlock(workflow, "guard-files");
    const guard = jobBlock(workflow, "guard");

    test("it waits only for the changed areas, and runs where the guard job runs", () => {
      expect(field(job, "needs")).toBe("changes");
      expect(field(job, "if")).toBe(field(guard, "if"));
      expect(field(job, "runs-on")).toBe("ubuntu-24.04");
    });

    test("it compares with the merge ref's first parent, read from the checkout", () => {
      expect(job).toContain("sha=$(git rev-parse --verify HEAD^1)");
      expect(job).toContain(`ref: \${{ steps.base.outputs.sha }}`);
    });

    test("it runs the merge base's guard with the merge base's dependencies and Node, uncached", () => {
      expect(job).toContain("package_json_file: base/package.json");
      expect(job).toContain("cache: false");
      expect(job).toMatch(/working-directory: base\n {8}run: pnpm install --frozen-lockfile\n/);
      expect(job).toContain('base_node=$(cd "$BASE_DIR" && pnpm exec node -p process.execPath)');
      expect(job).toContain('"$base_node" "$BASE_DIR/$guard" --base "$BASE_DIR" --skip-test-runs');
      expect(job).not.toMatch(/^ {10}run: pnpm /m);
    });

    test("it checks the note's signature for this pull request", () => {
      expect(job).toContain(
        '--repo "$REPO" --pr "$PR_NUMBER" --head-sha "$PR_HEAD_SHA" --base-sha "$PR_BASE_SHA"',
      );
    });

    test("ci-ok waits for it", () => {
      expect(jobBlock(workflow, "ci-ok")).toMatch(/^ {8}guard-files,$/m);
    });
  });
});
