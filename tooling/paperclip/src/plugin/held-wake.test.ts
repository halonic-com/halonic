import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { emptyMergeState, type HeldRun } from "../merge-control/state.ts";
import type { PullFacts } from "../pr-watcher/decide.ts";
import { pullKey } from "../pr-watcher/facts.ts";
import { type HeldHead, heldHeads } from "../pr-watcher/held.ts";
import { tick } from "../pr-watcher/watch.ts";
import { type FakeComment, type FakeIssue, fakeHost } from "./fake-host.test-helper.ts";
import { paperclipHost } from "./host.ts";

/**
 * The culprit of a failed merge group (HAL-18147): merge control holds its
 * head, and the watcher wakes the author's task once per held head, as
 * `todo` whatever its status, naming the failed check, the run and the error.
 */

const repo = "acme/tools";
const branch = "mateo/HAL-42-acme-widget";
const head = "4242aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const newHead = "4242bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const runUrl = "https://github.com/acme/tools/actions/runs/7042";

function issue(status: string): FakeIssue {
  return { id: "task-42", identifier: "HAL-42", status, assigneeAgentId: "agent-mateo" };
}

function openPull(at: string): PullFacts {
  return {
    repo,
    number: 42,
    url: `https://github.com/${repo}/pull/42`,
    state: "open",
    branch,
    head: at,
    ciOkOnHead: "success",
    draft: false,
    conflicting: false,
    inQueue: false,
    retargeted: false,
    latestReview: undefined,
    landed: false,
    mergedAt: undefined,
  };
}

function hold(error: string | null): HeldHead {
  return { repo, number: 42, head, url: runUrl, jobs: ["Test (core)"], error };
}

/** Watcher passes through the host adapter, one per pull request head; Paperclip keeps each pass's comments. */
async function passes(status: string, held: readonly HeldHead[], heads: readonly string[]) {
  const comments: Record<string, FakeComment[]> = {};
  const { host, writes } = fakeHost([issue(status)], comments);
  const counts: number[] = [];
  for (const at of heads) {
    const summary = await tick({
      paperclip: paperclipHost(host, "acme"),
      discover: async () => new Map([["HAL-42", [{ repo, number: 42, branch }]]]),
      facts: async (refs) => new Map(refs.map((ref) => [pullKey(ref), openPull(at)] as const)),
      dryRun: false,
      log: () => undefined,
      now: new Date("2026-11-25T04:00:00Z"),
      held,
    });
    counts.push(summary.woken);
    comments["task-42"] = writes.flatMap((write) =>
      write.kind === "comment"
        ? [{ authorAgentId: null, authorUserId: null, createdAt: new Date(), body: write.body }]
        : [],
    );
  }
  return { counts, writes };
}

verifies("paperclip.pr-watcher-held", () => {
  for (const status of ["blocked", "in_review", "backlog", "in_progress"]) {
    test(`wakes the author once per held head as todo, from ${status}, naming the check, the run and the error`, async () => {
      const { counts, writes } = await passes(
        status,
        [hold("Expected 3, received 4")],
        [head, head],
      );
      expect(counts).toEqual([1, 0]);
      expect(writes.map((write) => write.kind)).toEqual(["update", "comment", "wake"]);
      expect(writes[0]).toEqual({ kind: "update", issueId: "task-42", patch: { status: "todo" } });
      const body = writes[1]?.kind === "comment" ? writes[1].body : "";
      expect(body).toContain("its merge group failed in `Test (core)`");
      expect(body).toContain(runUrl);
      expect(body).toContain("Error: `Expected 3, received 4`.");
      expect(body).toContain("`git fetch origin && git rebase origin/main`");
      expect(writes[2]).toEqual({
        kind: "wake",
        issueId: "task-42",
        options: {
          reason: "pr_watcher",
          idempotencyKey: `pr-watcher task-42 ${repo}#42 4242aaa held`,
        },
      });
    });
  }

  test("leaves a task already in todo as it is, and names no error line when none was read", async () => {
    const { counts, writes } = await passes("todo", [hold(null)], [head]);
    expect(counts).toEqual([1]);
    expect(writes.map((write) => write.kind)).toEqual(["comment", "wake"]);
    const body = writes[0]?.kind === "comment" ? writes[0].body : "";
    expect(body).toContain(runUrl);
    expect(body).not.toContain("Error:");
  });

  test("a new head clears it: no wake for a head merge control doesn't hold", async () => {
    const { counts, writes } = await passes("in_progress", [hold("boom")], [head, newHead]);
    expect(counts).toEqual([1, 0]);
    expect(writes.filter((write) => write.kind === "wake")).toHaveLength(1);
  });

  test("a task its reviewer holds isn't woken", async () => {
    const comments: Record<string, FakeComment[]> = {};
    const { host, writes } = fakeHost(
      [{ ...issue("todo"), assigneeAgentId: "agent-liam" }],
      comments,
    );
    await tick({
      paperclip: paperclipHost(host, "acme"),
      discover: async () => new Map([["HAL-42", [{ repo, number: 42, branch }]]]),
      facts: async (refs) => new Map(refs.map((ref) => [pullKey(ref), openPull(head)] as const)),
      dryRun: false,
      log: () => undefined,
      now: new Date("2026-11-25T04:00:00Z"),
      held: [hold("boom")],
    });
    expect(writes.filter((write) => write.kind !== "comment")).toEqual([]);
  });
});

verifies("paperclip.pr-watcher-held", () => {
  const run: HeldRun = { head, url: runUrl, jobs: ["Fast gates"], error: null };

  test("reads the holds from merge control's stored state, only while the hold names the run's head", () => {
    const stored = {
      version: 1,
      shadow: null,
      state: {
        ...emptyMergeState,
        failedHeads: { "42": head, "43": newHead },
        heldRuns: { "42": run, "43": { ...run, head } },
      },
    };
    expect(heldHeads(stored, repo)).toEqual([{ ...run, repo, number: 42 }]);
  });

  test("holds nothing before merge control's first pass, for another version, or for a hold without its run", () => {
    expect(heldHeads(null, repo)).toEqual([]);
    expect(heldHeads({ version: 2, state: { version: 1 } }, repo)).toEqual([]);
    const older = { version: 1, state: { version: 1, failedHeads: { "42": head } } };
    expect(heldHeads(older, repo)).toEqual([]);
  });
});
