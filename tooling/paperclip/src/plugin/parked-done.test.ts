import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "../pr-watcher/decide.ts";
import { pullKey } from "../pr-watcher/facts.ts";
import { tick } from "../pr-watcher/watch.ts";
import { type FakeComment, type FakeIssue, fakeHost } from "./fake-host.test-helper.ts";
import { paperclipHost } from "./host.ts";

/**
 * Every task whose pull requests landed is done, whatever its status, project
 * or labels (HAL-18147). On 25 Nov a task still `blocked` on a security
 * sign-off that had since come stayed open after its pull request merged,
 * and so did the tasks it blocked.
 */

const repo = "acme/tools";
const branch = "priya/HAL-77-acme-approvals";
const mergedAt = "2026-11-25T03:21:47Z";

const merged: PullFacts = {
  repo,
  number: 77,
  url: `https://github.com/${repo}/pull/77`,
  state: "merged",
  branch,
  head: "7777aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ciOkOnHead: "missing",
  draft: false,
  conflicting: false,
  inQueue: false,
  retargeted: false,
  latestReview: undefined,
  landed: true,
  mergedAt,
};

function issue(status: string): FakeIssue {
  return { id: "task-77", identifier: "HAL-77", status, assigneeAgentId: "agent-priya" };
}

function comment(createdAt: string, body: string): FakeComment {
  return { authorAgentId: "agent-priya", authorUserId: null, createdAt: new Date(createdAt), body };
}

async function pass(status: string, comments: Record<string, FakeComment[]> = {}) {
  const { host, writes } = fakeHost([issue(status)], comments);
  const summary = await tick({
    paperclip: paperclipHost(host, "acme"),
    discover: async () => new Map([["HAL-77", [{ repo, number: 77, branch }]]]),
    facts: async (refs) => new Map(refs.map((ref) => [pullKey(ref), merged] as const)),
    dryRun: false,
    log: () => undefined,
    now: new Date("2026-11-25T03:30:00Z"),
  });
  return { summary, writes };
}

verifies("paperclip.pr-watcher-done", () => {
  for (const status of ["blocked", "backlog", "in_review", "todo"]) {
    test(`marks a task in ${status} done once its pull request merged green`, async () => {
      const before = {
        "task-77": [comment("2026-11-25T03:05:00Z", "Approved; waiting for the queue.")],
      };
      const { summary, writes } = await pass(status, before);
      expect(summary.done).toBe(1);
      expect(writes).toEqual([
        { kind: "update", issueId: "task-77", patch: { status: "done" } },
        {
          kind: "comment",
          issueId: "task-77",
          body: `PR watcher: [#77](https://github.com/${repo}/pull/77) merged and \`ci-ok\` is green on the base branch, so this task is done.`,
        },
      ]);
    });
  }

  for (const status of ["blocked", "in_progress"]) {
    test(`leaves a task in ${status} open when its holder's newest comment, after the merge, has the hold line`, async () => {
      const held = {
        "task-77": [
          comment("2026-11-25T03:05:00Z", "Approved."),
          comment(
            "2026-11-25T03:25:00Z",
            "Merged. The live check is left.\n\nPR watcher: more PRs to come",
          ),
        ],
      };
      const { summary, writes } = await pass(status, held);
      expect([summary.done, summary.woken]).toEqual([0, 0]);
      expect(writes).toEqual([]);
    });
  }

  test("leaves a blocked task open, and wakes nobody, when someone commented after the merge", async () => {
    const later = {
      "task-77": [comment("2026-11-25T03:25:00Z", "Merged; the live check waits on access.")],
    };
    const { summary, writes } = await pass("blocked", later);
    expect([summary.done, summary.woken]).toEqual([0, 0]);
    expect(writes).toEqual([]);
  });
});
