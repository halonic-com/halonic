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

/** The jobs whose failure mustn't cancel a pull request's run: another workflow re-runs them alone, or a later job reports it again. */
const rerunAlone = [
  "Fast gates",
  "Leak guard",
  "Coverage floors don't go down",
  "Live cloud suites passed",
  // Not re-run alone, but the guard job reports its finding again at the end (HAL-17892).
  "Requirement guard, file checks (merge base's copy)",
];

verifies("check.ci-pr-fail-fast", () => {
  describe("ci.yml cancels a run at its first failed job", () => {
    const jobs = jobBlocks(workflow);
    const failFast = jobs.get("fail-fast") ?? "";
    const ciOk = jobs.get("ci-ok") ?? "";

    test("the watcher runs on pull requests and in merge groups", () => {
      expect(field(failFast, "if")).toBe(
        "github.event_name == 'merge_group' || github.event_name == 'pull_request'",
      );
    });

    test("on a pull request it skips only the jobs whose failure is reported again", () => {
      const ignored = /ignored='(\[.+\])'$/m.exec(failFast.replaceAll(`'"'"'`, "'"))?.[1] ?? "[]";
      expect(JSON.parse(ignored)).toEqual(rerunAlone);
      for (const name of rerunAlone) {
        expect(
          [...jobs.values()].some((block) => field(block, "name") === name),
          name,
        ).toBe(true);
      }
      expect(failFast).toContain("select(.name | IN($ignored[]) | not)");
    });

    test("in a merge group it still cancels the live suites and a run whose group is gone", () => {
      expect(failFast).toContain('if [ "$EVENT" = merge_group ]; then\n');
      expect(failFast).toContain("live-cloud.yml/runs?head_sha=$HEAD_SHA&event=merge_group");
      expect(failFast).toContain(`gh api --silent "repos/$REPO/git/ref/\${HEAD_REF#refs/}"`);
    });

    test("ci-ok runs after a cancel only when a job failed, and names that job", () => {
      expect(field(ciOk, "if")).toBe(
        `\${{ github.event_name == 'merge_group' || !cancelled() || contains(needs.*.result, 'failure') }}`,
      );
      expect(ciOk).not.toMatch(/^ {8}fail-fast,$/m);
      expect(ciOk).toContain('echo "::error::Failed: $failed.');
    });
  });
});
