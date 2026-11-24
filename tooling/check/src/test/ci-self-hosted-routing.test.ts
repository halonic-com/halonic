import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

/** The bots whose pull requests stay off our server (HAL-17463), besides any `[bot]` login. */
const BOTS = ["dependabot", "renovate", "renovate-bot"];

/** The fast pool's part (HAL-15972, HAL-17616): a fast-track pull request a person opened. */
const FAST =
  "github.event_name == 'pull_request' && vars.CI_RUNNER_FAST != ''" +
  " && github.event.pull_request.head.repo.full_name == github.repository" +
  " && contains(github.event.pull_request.labels.*.name, 'fast-track')" +
  " && github.event.pull_request.user.type == 'User'" +
  " && !endsWith(github.event.pull_request.user.login, '[bot]')" +
  BOTS.map((bot) => ` && github.event.pull_request.user.login != '${bot}'`).join("") +
  " && fromJSON(vars.CI_RUNNER_FAST)";

/** The pool's part: a merge group or a push to main, for the runner in `variable`. */
function pool(variable: "CI_RUNNER_LARGE" | "CI_RUNNER_SMALL"): string {
  return (
    `vars.${variable} != '' && contains(fromJSON(vars.CI_SELF_HOSTED_EVENTS || '[]'), github.event_name)` +
    " && (github.event_name == 'merge_group' || github.event_name == 'push' && github.ref == 'refs/heads/main')" +
    ` && fromJSON(vars.${variable})`
  );
}

/** The one expression a job on our own CI server uses, for the runner in `variable`. */
function routing(variable: "CI_RUNNER_LARGE" | "CI_RUNNER_SMALL"): string {
  return `\${{ ${FAST} || ${pool(variable)} || 'ubuntu-24.04' }}`;
}

/** Every job's `runs-on` value in ci.yml, by job key. */
function runsOnByJob(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let job = "";
  for (const line of text.split("\n")) {
    const jobKey = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (jobKey?.[1]) job = jobKey[1];
    const runsOn = /^ {4}runs-on: (.+)$/.exec(line);
    if (runsOn?.[1] && job) result.set(job, runsOn[1]);
  }
  return result;
}

const large = ["build", "e2e", "scaffold", "fast"];
const small = ["trace", "policy-base", "docs"];
// Docker (gitleaks), a Python venv (zizmor) and a secret (leaks) aren't on the server.
// `changes` gates the end-to-end job and starts sooner on GitHub's runners (HAL-16095).
const kept = [
  "changes",
  "leaks",
  "gitleaks",
  "zizmor",
  "sandbox-fence",
  "android",
  "tauri",
  "live-cloud",
  "fail-fast",
  "merged",
  "ci-ok",
];

verifies("check.ci-self-hosted-routing", () => {
  describe("ci.yml's routing to our own CI server", () => {
    const runsOn = runsOnByJob(workflow);

    test("every job that can run on the server uses the one expression for its size", () => {
      for (const job of large) expect(runsOn.get(job), job).toBe(routing("CI_RUNNER_LARGE"));
      for (const job of small) expect(runsOn.get(job), job).toBe(routing("CI_RUNNER_SMALL"));
    });

    test("no other job names the server's variables or labels", () => {
      const moved = new Set([...large, ...small]);
      for (const [job, value] of runsOn) {
        if (moved.has(job)) continue;
        expect(value, job).not.toMatch(/CI_RUNNER_|CI_SELF_HOSTED_EVENTS|halonic-ci|self-hosted/);
      }
      for (const job of kept) expect(runsOn.get(job), job).toBe("ubuntu-24.04");
    });

    test("the old merge-queue switch is gone", () => {
      expect(workflow).not.toMatch(/vars\.MERGE_QUEUE_RUNNER/);
    });

    test("the pool's part only routes merge groups and pushes to main, and only with the variable set", () => {
      const expression = pool("CI_RUNNER_LARGE");
      expect(expression.startsWith("vars.CI_RUNNER_LARGE != '' && ")).toBe(true);
      expect(expression).toContain(
        "github.event_name == 'merge_group' || github.event_name == 'push' && github.ref == 'refs/heads/main'",
      );
      expect(expression).not.toContain("pull_request");
      expect(routing("CI_RUNNER_LARGE").endsWith(`|| ${expression} || 'ubuntu-24.04' }}`)).toBe(
        true,
      );
    });

    test("only a fast-track pull request a person opened from our own branch goes to the fast pool, with its variable set", () => {
      const expression = routing("CI_RUNNER_SMALL");
      expect(expression.startsWith(`\${{ ${FAST} || `)).toBe(true);
      // Every condition must hold: the fast part is one chain of &&, without an ||.
      expect(FAST).not.toContain("||");
      expect(FAST.split(" && ")).toEqual([
        "github.event_name == 'pull_request'",
        "vars.CI_RUNNER_FAST != ''",
        "github.event.pull_request.head.repo.full_name == github.repository",
        "contains(github.event.pull_request.labels.*.name, 'fast-track')",
        "github.event.pull_request.user.type == 'User'",
        "!endsWith(github.event.pull_request.user.login, '[bot]')",
        "github.event.pull_request.user.login != 'dependabot'",
        "github.event.pull_request.user.login != 'renovate'",
        "github.event.pull_request.user.login != 'renovate-bot'",
        "fromJSON(vars.CI_RUNNER_FAST)",
      ]);
      // The label and the author both decide (HAL-17616): a labelled bot's pull request stays on
      // GitHub's runners, and so does a person's without the label.
    });
  });
});
