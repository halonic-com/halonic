import { verifies } from "@halonicjs/testing-spec";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import { manifest } from "../plugin/manifest.ts";
import { ToolInputError } from "../task-tools/input.ts";
import type { VerdictKind } from "./record.ts";
import {
  readVerdictParams,
  reviewVerdict,
  type VerdictDeps,
  type VerdictPullFacts,
  type VerdictTask,
} from "./review-verdict.ts";
import { entityVerdicts } from "./store.ts";

const repo = "halonic-com/halonic";
const head = "c".repeat(40);
const agents = [
  { id: "agent-elena", urlKey: "elena" },
  { id: "agent-liam", urlKey: "liam" },
  { id: "agent-julian", urlKey: "julian" },
];

/** Elena's open #6385 on her branch for HAL-1, Liam's to review by its paths. */
const pullFacts: VerdictPullFacts = {
  state: "open",
  head,
  branch: "elena/HAL-1-name",
  ownBranch: true,
  openedBy: "halonic-dev",
  fingerprint: "fp-1",
  reviewer: "liam",
  routineRefusal: "outside the second reviewer's limits",
};

const tasks: Record<string, VerdictTask> = {
  "HAL-1": { id: "task-1", identifier: "HAL-1", title: "Elena's task", description: null },
  "HAL-2": {
    id: "task-2",
    identifier: "HAL-2",
    title: "Security review",
    description: "Review https://github.com/halonic-com/halonic/pull/6385 (elena/HAL-1-name).",
  },
  "HAL-3": {
    id: "task-3",
    identifier: "HAL-3",
    title: "Another task",
    description: "halonic#6385",
  },
};

/** Fake deps: the caller, Paperclip and GitHub as given, and a real (test host) store. */
function fakeDeps(
  options: {
    reviewer?: string;
    pull?: Partial<VerdictPullFacts>;
    deps?: Partial<VerdictDeps>;
  } = {},
) {
  const harness = createTestHarness({ manifest, config: {} });
  const posted: { taskId: string; body: string }[] = [];
  const reviewer = options.reviewer ?? "liam";
  const deps: VerdictDeps = {
    caller: { reviewer, agentId: `agent-${reviewer}`, runId: "run-1" },
    teamLogin: "halonic-dev",
    task: async (identifier) => {
      const task = tasks[identifier];
      if (task === undefined) throw new ToolInputError(`no task ${identifier}`);
      return task;
    },
    runHolds: async () => undefined,
    pull: async () => ({ ...pullFacts, ...options.pull }),
    taskComments: async (identifier) =>
      identifier === "HAL-1"
        ? [{ authorAgentId: "agent-elena", body: "Ready for review: halonic#6385." }]
        : [],
    agents: async () => agents,
    store: entityVerdicts(harness.ctx.entities, "acme"),
    postAsCaller: async (taskId, body) => {
      posted.push({ taskId, body });
    },
    ...options.deps,
  };
  return { deps, posted };
}

function call(verdict: VerdictKind, more: Record<string, unknown> = {}) {
  return readVerdictParams({ pr: 6385, task: "HAL-1", verdict, head, ...more }, [repo]);
}

verifies("paperclip.review-verdict", () => {
  describe("review_verdict", () => {
    test("records Liam's approval on the exact head and posts its line on the task as him", async () => {
      const { deps, posted } = fakeDeps();
      const { record, line } = await reviewVerdict(deps, call("approved"));
      expect(record).toMatchObject({
        repo,
        pr: 6385,
        head,
        fingerprint: "fp-1",
        verdict: "approved",
        reviewer: "liam",
        agentId: "agent-liam",
        runId: "run-1",
        task: "HAL-1",
      });
      expect(line).toBe(`Liam: approved on head \`${head}\``);
      expect(posted).toEqual([
        {
          taskId: "task-1",
          body: `${line}\n\nRecorded with review_verdict (record \`${record.id}\`).`,
        },
      ]);
      expect(await deps.store.list(repo, 6385)).toHaveLength(1);
    });

    test("refuses an agent the settings don't name, and security-ok from anyone but Julian", async () => {
      const { deps } = fakeDeps({ deps: { caller: undefined } });
      await expect(reviewVerdict(deps, call("approved"))).rejects.toThrow(
        "only the reviewers' agents the plugin's settings name record verdicts.",
      );
      const liam = fakeDeps();
      await expect(reviewVerdict(liam.deps, call("security-ok"))).rejects.toThrow(
        "only Julian records security-ok.",
      );
    });

    test("refuses a run that doesn't hold the task, and records nothing", async () => {
      const { deps, posted } = fakeDeps({
        deps: { runHolds: async () => "your run isn't running." },
      });
      await expect(reviewVerdict(deps, call("approved"))).rejects.toThrow(
        "your run isn't running.",
      );
      expect(await deps.store.list(repo, 6385)).toEqual([]);
      expect(posted).toEqual([]);
    });

    test("refuses a head that isn't the pull request's current one, and a closed pull request", async () => {
      const moved = fakeDeps({ pull: { head: "d".repeat(40) } });
      await expect(reviewVerdict(moved.deps, call("approved"))).rejects.toThrow(
        `the pull request's head is now ${"d".repeat(40)}, not ${head}.`,
      );
      const closed = fakeDeps({ pull: { state: "closed" } });
      await expect(reviewVerdict(closed.deps, call("approved"))).rejects.toThrow("isn't open");
    });

    test("takes the branch's task, or a review task that links the pull request and names its branch", async () => {
      const review = fakeDeps();
      const { record } = await reviewVerdict(review.deps, call("approved", { task: "HAL-2" }));
      expect(record.task).toBe("HAL-2");
      const other = fakeDeps();
      await expect(reviewVerdict(other.deps, call("approved", { task: "HAL-3" }))).rejects.toThrow(
        "HAL-3 isn't the pull request's task",
      );
    });

    test("refuses when it can't tell who wrote the pull request", async () => {
      const { deps } = fakeDeps({ deps: { taskComments: async () => [] } });
      await expect(reviewVerdict(deps, call("approved"))).rejects.toThrow(
        "can't tell who wrote the pull request: elena, whom the branch names, hasn't named halonic#6385",
      );
    });

    test("applies the HAL-14809 rules: no own pull request, Julian only within his limits", async () => {
      const liamComment = async () => [{ authorAgentId: "agent-liam", body: "halonic#6385" }];
      const own = fakeDeps({
        pull: { branch: "liam/HAL-1-name" },
        deps: { taskComments: liamComment },
      });
      await expect(reviewVerdict(own.deps, call("approved"))).rejects.toThrow(
        "the review rules (HAL-14809) refuse it: it's your own pull request.",
      );
      const julian = fakeDeps({ reviewer: "julian" });
      await expect(reviewVerdict(julian.deps, call("approved"))).rejects.toThrow(
        "outside Julian's limits (HAL-14809)",
      );
      const inScope = fakeDeps({
        reviewer: "julian",
        pull: { reviewer: "julian", routineRefusal: "touches .github/workflows" },
      });
      expect((await reviewVerdict(inScope.deps, call("approved"))).record.verdict).toBe("approved");
    });

    test("Nora approves only within the routine scope", async () => {
      const outside = fakeDeps({ reviewer: "nora" });
      await expect(reviewVerdict(outside.deps, call("approved"))).rejects.toThrow(
        "outside the routine scope (outside the second reviewer's limits)",
      );
      const excluded = fakeDeps({
        reviewer: "nora",
        pull: { reviewer: "julian", routineRefusal: "touches .github/workflows" },
      });
      await expect(reviewVerdict(excluded.deps, call("approved"))).rejects.toThrow(
        "outside the routine scope (touches .github/workflows)",
      );
      const routine = fakeDeps({
        reviewer: "nora",
        pull: { reviewer: "julian", routineRefusal: null },
      });
      expect((await reviewVerdict(routine.deps, call("approved"))).record.verdict).toBe("approved");
    });

    test("Julian's change request on Liam's paths can be withdrawn, and only by him", async () => {
      const julian = fakeDeps({ reviewer: "julian" });
      await reviewVerdict(julian.deps, call("changes-requested"));
      const liam = {
        ...julian.deps,
        caller: { reviewer: "liam", agentId: "agent-liam", runId: "run-2" },
      };
      await expect(reviewVerdict(liam, call("withdrawn"))).rejects.toThrow(
        "you have no change request on it to withdraw.",
      );
      const { line } = await reviewVerdict(julian.deps, call("withdrawn"));
      expect(line).toBe(`Julian: change request withdrawn on head \`${head}\``);
    });
  });

  test("readVerdictParams takes only a full head, a known verdict and a HAL task", () => {
    expect(call("approved", { head: head.toUpperCase(), task: "hal-1" })).toEqual({
      repo,
      pr: 6385,
      task: "HAL-1",
      verdict: "approved",
      head,
    });
    expect(() => call("approved", { head: "c".repeat(7) })).toThrow("full 40-character head");
    expect(() => call("re-approved" as VerdictKind)).toThrow("verdict must be one of");
    expect(() => call("approved", { task: "6385" })).toThrow("task must be");
    expect(() => call("approved", { repo: "someone/else" })).toThrow("repo must be one of");
  });
});
