import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`../../../../.github/workflows/${name}`, import.meta.url), "utf8");
const workflow = read("ci.yml");

/** The bots whose pull requests stay off our server (HAL-17463), besides any `[bot]` login. */
const BOTS = ["dependabot", "renovate", "renovate-bot"];

/**
 * The fast pool's part (HAL-15972, HAL-17616, HAL-17654): a pull request a person opened from our
 * own branch, while `pick-runner` found room on the pool (and, by default, the fast-track label).
 */
const FAST =
  "github.event_name == 'pull_request' && vars.CI_RUNNER_FAST != ''" +
  " && github.event.pull_request.head.repo.full_name == github.repository" +
  " && needs.pick-runner.outputs.fast == 'true'" +
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

/** The name of an old label run that did nothing (HAL-17672), still on some pull requests' heads. */
const NOOP_TITLE = "A label was added: nothing to run";

/** The lines of one job in ci.yml, from its key to the next job's. */
function jobBlock(text: string, job: string): string {
  const start = text.indexOf(`\n  ${job}:\n`);
  if (start < 0) return "";
  const next = text.slice(start + 1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
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
  "pick-runner",
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
        "needs.pick-runner.outputs.fast == 'true'",
        "github.event.pull_request.user.type == 'User'",
        "!endsWith(github.event.pull_request.user.login, '[bot]')",
        "github.event.pull_request.user.login != 'dependabot'",
        "github.event.pull_request.user.login != 'renovate'",
        "github.event.pull_request.user.login != 'renovate-bot'",
        "fromJSON(vars.CI_RUNNER_FAST)",
      ]);
      // The picker and the author both decide (HAL-17616, HAL-17654): a bot's pull request stays
      // on GitHub's runners whatever the picker says, and so does a person's the picker didn't send.
    });

    test("every job on the server waits for pick-runner and still runs when it skipped", () => {
      for (const job of [...large, ...small]) {
        const block = jobBlock(workflow, job);
        expect(block, job).toMatch(
          /^ {4}needs: (pick-runner|\[[a-z, -]*\bpick-runner\b[a-z, -]*\])$/m,
        );
        expect(block, job).toMatch(/^ {4}if: \$\{\{ !cancelled\(\) && /m);
      }
    });

    test("pick-runner runs only for a pull request a person opened from our own branch", () => {
      const block = jobBlock(workflow, "pick-runner");
      const condition = /^ {4}if: \$\{\{ (.+) \}\}$/m.exec(block)?.[1] ?? "";
      expect(condition.split(" && ")).toEqual([
        "github.event_name == 'pull_request'",
        "vars.CI_RUNNER_FAST != ''",
        "github.event.pull_request.head.repo.full_name == github.repository",
        "github.event.pull_request.user.type == 'User'",
        "!endsWith(github.event.pull_request.user.login, '[bot]')",
        ...BOTS.map((bot) => `github.event.pull_request.user.login != '${bot}'`),
      ]);
      expect(runsOn.get("pick-runner")).toBe("ubuntu-24.04");
      // Only a read-only runners token: the App's one permission, never a write.
      expect(block).toContain("permission-organization-self-hosted-runners: read");
      expect(block).not.toMatch(/permission-[a-z-]+: write/);
      expect(block).toContain("continue-on-error: true");
    });

    test("no label starts a run of ci.yml (HAL-17990)", () => {
      // GitHub counts only a commit's newest run of a workflow: a run for a label, even one that
      // skips every job, hid the real ci-ok and left the required check "expected".
      const triggers = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\njobs:\n"));
      expect(triggers).toContain(
        "  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\n",
      );
      expect(workflow).not.toContain("github.event.action == 'labeled'");
      expect(workflow).not.toContain("github.event.action != 'labeled'");
      expect(triggers).not.toMatch(/^run-name:/m);
    });

    test("pick-runner reads the labels as they are now, so a re-run sees fast-track (HAL-17990)", () => {
      const block = jobBlock(workflow, "pick-runner");
      expect(block).toContain("      pull-requests: read\n");
      expect(block).toMatch(
        /- id: labels\n {8}name: Read the pull request's current labels\n {8}continue-on-error: true\n/,
      );
      // A failed read falls back to the event's labels, never to an error.
      expect(block).toContain(
        "PR_LABELS: ${{ steps.labels.outputs.labels || toJSON(github.event.pull_request.labels.*.name) }}",
      );
    });

    test("adding fast-track re-runs the pull request's newest CI run in full (HAL-17990)", () => {
      const details = read("pr-details.yml");
      expect(details).toContain(
        "if: github.event.action == 'labeled' && github.event.label.name == 'fast-track' && github.event.pull_request.head.repo.full_name == github.repository",
      );
      expect(details).toMatch(/\n {10}gh run rerun "\$run"\n/);
      // Its own concurrency group: another label added at once doesn't cancel it.
      expect(details).toContain(
        "group: pr-details-${{ github.event.pull_request.number || github.event.workflow_run.id }}${{ github.event.label.name == 'fast-track' && '-fast-track' || '' }}",
      );
    });

    test("the workflows that look for a pull request's newest CI run pass a label's empty run over", () => {
      expect(read("pr-details.yml")).toContain(
        `--jq '[.[] | select(.displayTitle != "${NOOP_TITLE}")][0].databaseId // empty'`,
      );
      expect(read("live-cloud-gate.yml")).toContain(
        `--jq '[.workflow_runs[] | select(.display_title != "${NOOP_TITLE}")][0] // empty | `,
      );
    });
  });
});
