import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
// The decision itself (which pushes reuse which run) is tested by the helper's own node test in
// the fast gates, which also checks that the job and notice names below and the step that runs it
// match the helper; this file checks ci.yml's wiring only. It doesn't read the helper: no
// package's tests read its folder (affected-tests' noPackageTestPaths).
const REUSE_TITLE = "Signature-only push";
const MERGE_BASE_TITLE = "Merge base's results";

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

/** The jobs a signature-only push skips: the build, the merge base's tests and every area job. */
const skipped = [
  "base-tests",
  "scaffold",
  "tauri",
  "tauri-windows",
  "tauri-keychain-macos",
  "sandbox-fence",
  "sandbox-fence-macos",
  "sandbox-mxc-fence",
  "sandbox-os",
  "sandbox-windows",
  "agent-host",
  "wsl-runtime",
  "wsl-image",
  "installer-windows",
  "update-windows",
  "android",
  "android-device-keys",
  "e2e",
  "docs",
];

verifies("check.ci-pr-signature-reuse", () => {
  describe("ci.yml reuses the previous head's results for a signature-only push", () => {
    const jobs = jobBlocks(workflow);
    const reuse = jobs.get("signature-reuse") ?? "";

    test("the check runs only on a pull request's new commit, on GitHub's runner, and never fails", () => {
      // The job itself runs wherever `changes` runs: a skipped job would skip every job below
      // `changes` that has no status check (the bug in the first run of HAL-17896's pull request).
      expect(field(reuse, "if")).toBe(
        "github.event.action != 'labeled' || github.event.label.name == 'fast-track'",
      );
      const onlyNewCommits =
        "        if: github.event_name == 'pull_request' && github.event.action == 'synchronize' && !github.event.pull_request.draft && vars.CI_PR_SIGNATURE_REUSE != 'off'\n";
      expect(reuse.split(onlyNewCommits)).toHaveLength(3);
      expect(field(reuse, "runs-on")).toBe("ubuntu-24.04");
      expect(reuse).toContain("continue-on-error: true");
      expect(jobs.get("ci-ok")).toMatch(/^ {8}signature-reuse,$/m);
      expect(jobs.get("changes")).toMatch(/^ {4}if: \$\{\{ !cancelled\(\) && /m);
      // A later push finds this job by its name and reads its notice by the same title.
      expect(field(reuse, "name")).toBe(REUSE_TITLE);
    });

    test("the build and every area job skip on a reuse, the cheap gates and the guard don't", () => {
      expect(field(jobs.get("build") ?? "", "if")).toContain(
        "&& needs.signature-reuse.outputs.run == '' }}",
      );
      expect(jobs.get("changes")).toContain("reuse: ${{ needs.signature-reuse.outputs.run }}");
      for (const job of skipped) {
        expect(field(jobs.get(job) ?? "", "if"), job).toContain(
          "needs.changes.outputs.reuse == ''",
        );
      }
      for (const [job, block] of jobs) {
        if ([...skipped, "build", "changes", "guard", "signature-reuse"].includes(job)) continue;
        expect(block, job).not.toMatch(/outputs\.(reuse|run)\b/);
      }
    });

    test("the guard reads the reused run's results and merge base, and the merge base's job reports them", () => {
      const guard = jobs.get("guard") ?? "";
      expect(guard).toContain("REUSE_RUN: ${{ needs.signature-reuse.outputs.run }}");
      expect(guard.match(/run-id: \$\{\{ env\.REUSE_RUN \|\| github\.run_id \}\}/g)).toHaveLength(
        2,
      );
      expect(guard).toContain('git merge-tree --write-tree "$BUILT_ON_SHA" "$PR_HEAD_SHA"');
      // Every step after the first reads the merge base from that step, whichever run it came from.
      expect(guard.slice(guard.indexOf('{\n            echo "sha=$BASE_SHA"'))).not.toContain(
        "needs.base-tests.outputs",
      );
      expect(jobs.get("base-tests")).toContain(
        `::notice title=${MERGE_BASE_TITLE}::sha=$SHA built-on=$BUILT_ON results-id=$RESULTS_ID results-sha256=$RESULTS_SHA256`,
      );
    });
  });
});
