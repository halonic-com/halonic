import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`../../../../.github/workflows/${name}`, import.meta.url), "utf8");
const workflow = read("ci.yml");

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

/** A label run that does nothing (HAL-17672): any label but fast-track. */
const NOOP = "github.event.action == 'labeled' && github.event.label.name != 'fast-track'";
/** What a job's condition holds so that it skips in such a run. */
const GUARD = "(github.event.action != 'labeled' || github.event.label.name == 'fast-track')";
/** Whether a job's condition skips it in such a run: the guard, or the guard alone (`changes`). */
const holdsGuard = (condition: string) =>
  condition.includes(GUARD) || condition === GUARD.slice(1, -1);
/** The name such a run gets, so the workflows that look for a pull request's CI run pass it over. */
const NOOP_TITLE = "A label was added: nothing to run";

/** Every job's lines in ci.yml, by job key. */
function jobBlocks(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let job = "";
  for (const line of text.slice(text.indexOf("\njobs:\n")).split("\n")) {
    const jobKey = /^ {2}([a-z][a-z0-9-]*):$/.exec(line);
    if (jobKey?.[1]) job = jobKey[1];
    if (job) result.set(job, `${result.get(job) ?? ""}${line}\n`);
  }
  return result;
}

/** A job's top-level `key: value` line, such as its `if`. */
function field(block: string, key: string): string {
  return new RegExp(`^ {4}${key}: (.+)$`, "m").exec(block)?.[1] ?? "";
}

/** The jobs a job needs, from `needs: a` or `needs: [a, b]`. */
function needsOf(block: string): string[] {
  return field(block, "needs")
    .replace(/[[\]]/g, "")
    .split(",")
    .map((job) => job.trim())
    .filter(Boolean);
}

/** Why a job skips in a label run that does nothing, or "" when nothing makes it skip. */
function whyItSkips(block: string, guarded: Set<string>): string {
  const condition = field(block, "if");
  const needs = needsOf(block);
  if (holdsGuard(condition)) return "its condition holds the guard";
  if (
    /github\.event_name == '(push|merge_group)'|github\.event_name != 'pull_request'/.test(
      condition,
    )
  ) {
    return "it never runs for a pull request";
  }
  // A job whose condition has no status check skips when a job it needs skipped.
  if (!/cancelled\(\)|always\(\)/.test(condition)) {
    return needs.some((need) => guarded.has(need)) ? "it needs a job that skips" : "";
  }
  // One that runs after a skipped job still asks for an output `changes` didn't give.
  const asksForChanges =
    guarded.has("changes") &&
    needs.includes("changes") &&
    !condition.includes("||") &&
    / && needs\.changes\.outputs\.[a-z_-]+ == 'true'/.test(condition);
  return asksForChanges ? "it asks for an output of changes, which skipped" : "";
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

    test("a label starts a run only for fast-track; removing one starts none (HAL-17672)", () => {
      const triggers = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\njobs:\n"));
      expect(triggers).toContain(
        "  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review, labeled]\n",
      );
      expect(triggers).toContain(`run-name: "\${{ ${NOOP} && '${NOOP_TITLE}' || '' }}"\n`);
      // Any other label gets a group of its own run, so it cancels nothing; fast-track joins the
      // pull request's group and replaces the run in progress, like a push.
      expect(triggers).toContain(
        `  group: ci-\${{ ${NOOP} && format('label-{0}', github.run_id) || github.event.pull_request.number || `,
      );
    });

    test("in a run for any other label every job skips, and ci-ok reports under another name", () => {
      const jobs = jobBlocks(workflow);
      expect(field(jobs.get("changes") ?? "", "if")).toBe(GUARD.slice(1, -1));
      const guarded = new Set(
        [...jobs].filter(([, block]) => holdsGuard(field(block, "if"))).map(([job]) => job),
      );
      for (const [job, block] of jobs) {
        if (job === "ci-ok") continue;
        expect(whyItSkips(block, guarded), job).not.toBe("");
      }
      // A skipped required check counts as passed, and a green one would stand in for the real run.
      expect(field(jobs.get("ci-ok") ?? "", "name")).toBe(
        `\${{ ${NOOP} && 'ci-ok (label added, nothing to run)' || github.event.pull_request.draft && 'ci-ok (draft, light run)' || 'ci-ok' }}`,
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
