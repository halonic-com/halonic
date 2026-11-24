import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "../pr-watcher/decide.ts";
import { pullKey } from "../pr-watcher/facts.ts";
import { tick } from "../pr-watcher/watch.ts";
import { type FakeComment, type FakeIssue, fakeHost } from "./fake-host.test-helper.ts";
import { paperclipHost } from "./host.ts";

/**
 * A stacked pull request's task, parked in `backlog` or `blocked` until the
 * one below merges, whose pull request GitHub then moved to `main` (#5737,
 * HAL-17869).
 */

const repo = "halonic-com/halonic";
const branch = "mateo/HAL-17744-pull-requests-page";

function parkedIssue(status: string): FakeIssue {
  return { id: "task-17744", identifier: "HAL-17744", status, assigneeAgentId: "agent-mateo" };
}

const retargetedPull: PullFacts = {
  repo,
  number: 5737,
  url: `https://github.com/${repo}/pull/5737`,
  state: "open",
  branch,
  head: "5737aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ciOkOnHead: "success",
  draft: false,
  conflicting: false,
  inQueue: false,
  retargeted: true,
  latestReview: undefined,
  landed: false,
  mergedAt: undefined,
};

/** Two watcher passes through the host adapter; Paperclip keeps the first pass's comment. */
async function twoPasses(issue: FakeIssue, wakeRefusal?: string) {
  const comments: Record<string, FakeComment[]> = {};
  const { host, writes } = fakeHost([issue], comments, wakeRefusal);
  const pass = () =>
    tick({
      paperclip: paperclipHost(host, "acme"),
      discover: async () => new Map([["HAL-17744", [{ repo, number: 5737, branch }]]]),
      facts: async (refs) => new Map(refs.map((ref) => [pullKey(ref), retargetedPull] as const)),
      dryRun: false,
      log: () => undefined,
      now: new Date("2026-11-24T19:40:00Z"),
    });
  const first = await pass();
  comments["task-17744"] = writes.flatMap((write) =>
    write.kind === "comment"
      ? [{ authorAgentId: null, authorUserId: null, createdAt: new Date(), body: write.body }]
      : [],
  );
  const second = await pass();
  return { first, second, writes };
}

verifies("paperclip.pr-watcher-retargeted", () => {
  for (const status of ["backlog", "blocked"]) {
    test(`comments and wakes the holder of a task in ${status} once per head, leaving its status`, async () => {
      const { first, second, writes } = await twoPasses(parkedIssue(status));
      expect([first.woken, second.woken]).toEqual([1, 0]);
      expect(writes.map((write) => write.kind)).toEqual(["comment", "wake"]);
      expect(writes[1]).toEqual({
        kind: "wake",
        issueId: "task-17744",
        options: {
          reason: "pr_watcher",
          idempotencyKey: `pr-watcher task-17744 ${repo}#5737 5737aaa retargeted`,
        },
      });
    });
  }

  test("lists a task in backlog or blocked as parked", async () => {
    const { host } = fakeHost([
      parkedIssue("backlog"),
      { ...parkedIssue("blocked"), id: "task-2", identifier: "HAL-2" },
      { ...parkedIssue("todo"), id: "task-3", identifier: "HAL-3" },
    ]);
    const tasks = await paperclipHost(host, "acme").openTasks();
    expect(tasks.map(({ identifier, parked }) => [identifier, parked])).toEqual([
      ["HAL-17744", true],
      ["HAL-3", false],
      ["HAL-2", true],
    ]);
  });

  test("moves a parked task to todo only when Paperclip won't wake it as it is", async () => {
    const { host, writes } = fakeHost([parkedIssue("backlog")]);
    let refusals = 0;
    const refusing = {
      ...host,
      issues: {
        ...host.issues,
        requestWakeup: async (...args: Parameters<typeof host.issues.requestWakeup>) => {
          if (writes.every((write) => write.kind !== "update")) {
            refusals += 1;
            throw new Error("Issue is not wakeable in status: backlog");
          }
          return host.issues.requestWakeup(...args);
        },
      },
    };
    expect(await paperclipHost(refusing, "acme").wake("task-17744", "PR watcher: x", "k1")).toBe(
      "written",
    );
    expect(refusals).toBe(1);
    expect(writes).toEqual([
      { kind: "comment", issueId: "task-17744", body: "PR watcher: x" },
      { kind: "update", issueId: "task-17744", patch: { status: "todo" } },
      {
        kind: "wake",
        issueId: "task-17744",
        options: { reason: "pr_watcher", idempotencyKey: "pr-watcher task-17744 k1" },
      },
    ]);
  });

  test("never marks a parked task done or hands it to a reviewer", async () => {
    for (const status of ["backlog", "blocked"]) {
      const { host, writes } = fakeHost([parkedIssue(status)]);
      const paperclip = paperclipHost(host, "acme");
      expect(await paperclip.markDone("task-17744", "PR watcher: done.")).toBe("closed");
      const change = { from: "agent-mateo", to: "agent-liam" };
      expect(await paperclip.handOff("task-17744", change, "PR watcher: x", "k1")).toBe("closed");
      expect(writes).toEqual([]);
    }
  });
});
