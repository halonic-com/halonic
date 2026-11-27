import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type FakeIssue, fakeHost, fakeState } from "./fake-host.test-helper.ts";
import { todoOnly } from "./host.ts";
import { unblockHost } from "./unblock-host.ts";

const owen = "agent-owen";
const d1 = { id: "task-d1", identifier: "HAL-17445", status: "done" };
const doneAt = new Date("2026-11-26T10:00:00.000Z");
const d1Task: FakeIssue = { ...d1, assigneeAgentId: owen, completedAt: doneAt };

/** HAL-17446, blocked by HAL-17445 since `blockedAt`, with HAL-17445 done at `doneAt`. */
function blockedBehindD1(blockedAt: Date, status = "blocked"): FakeIssue[] {
  return [
    {
      id: "task-d2",
      identifier: "HAL-17446",
      status,
      assigneeAgentId: owen,
      blockedTransitionAt: blockedAt,
    },
    d1Task,
  ];
}

verifies("paperclip.pr-watcher-unblock", () => {
  test("refuses every task change other than setting the status to todo", () => {
    expect(todoOnly({ status: "todo" })).toEqual({ status: "todo" });
    for (const patch of [
      { status: "done" },
      { status: "in_progress" },
      { status: "todo", assigneeAgentId: "agent-liam" },
      { blockedByIssueIds: [] },
      {},
    ]) {
      expect(() => todoOnly(patch)).toThrow("refusing a task change other than todo");
    }
  });

  test("lists only blocked tasks, with when they were blocked and when their blockers finished", async () => {
    const blockedAt = new Date("2026-11-26T09:00:00.000Z");
    const cancelled = { id: "task-c", identifier: "HAL-17447", status: "cancelled" };
    const { host } = fakeHost(
      [
        ...blockedBehindD1(blockedAt),
        { ...cancelled, assigneeAgentId: null, cancelledAt: doneAt },
        { id: "task-x", identifier: "HAL-9", status: "in_progress", assigneeAgentId: owen },
      ],
      {},
      undefined,
      { "task-d2": [d1, cancelled] },
    );
    const paperclip = unblockHost(host, "acme", fakeState().state);
    expect(await paperclip.blockedTasks()).toEqual([
      {
        id: "task-d2",
        identifier: "HAL-17446",
        assigneeAgentId: owen,
        running: false,
        blockedSince: "2026-11-26T09:00:00.000Z",
      },
    ]);
    expect(await paperclip.blockers("task-d2")).toEqual([
      { ...d1, finishedAt: "2026-11-26T10:00:00.000Z" },
      { ...cancelled, finishedAt: "2026-11-26T10:00:00.000Z" },
    ]);
  });

  test("gives no times when Paperclip doesn't, nor while a blocker is unfinished", async () => {
    const open = { id: "task-o", identifier: "HAL-17448", status: "in_progress" };
    const { host } = fakeHost(
      [
        { id: "task-d2", identifier: "HAL-17446", status: "blocked", assigneeAgentId: owen },
        d1Task,
      ],
      {},
      undefined,
      { "task-d2": [d1, open] },
    );
    const paperclip = unblockHost(host, "acme", fakeState().state);
    expect((await paperclip.blockedTasks())[0]?.blockedSince).toBeNull();
    expect(await paperclip.blockers("task-d2")).toEqual([
      { ...d1, finishedAt: null },
      { ...open, finishedAt: null },
    ]);
  });

  test("sets todo, comments, wakes the agent once per key, then remembers the key", async () => {
    const { host, writes } = fakeHost(
      blockedBehindD1(new Date("2026-11-26T09:00:00.000Z")),
      {},
      undefined,
      { "task-d2": [d1] },
    );
    const { state } = fakeState();
    const paperclip = unblockHost(host, "acme", state);
    expect(await paperclip.lastUnblock("task-d2")).toBeNull();
    expect(await paperclip.unblock("task-d2", "PR watcher: unblocked.", "k")).toBe("written");
    expect(writes).toEqual([
      { kind: "update", issueId: "task-d2", patch: { status: "todo" } },
      { kind: "comment", issueId: "task-d2", body: "PR watcher: unblocked." },
      {
        kind: "wake",
        issueId: "task-d2",
        options: { reason: "blockers_finished", idempotencyKey: "pr-watcher task-d2 k" },
      },
    ]);
    expect(await paperclip.lastUnblock("task-d2")).toBe("k");
    // The record names its company, so another company's sweep doesn't count it.
    expect(await unblockHost(host, "globex", state).lastUnblock("task-d2")).toBeNull();
  });

  test("writes nothing when the task moved, or got an open blocker, during the pass", async () => {
    const open = { id: "task-d3", identifier: "HAL-17447", status: "in_progress" };
    const { host, writes } = fakeHost(
      [
        { id: "task-a", identifier: "HAL-1", status: "in_progress", assigneeAgentId: owen },
        { id: "task-b", identifier: "HAL-2", status: "blocked", assigneeAgentId: owen },
      ],
      {},
      undefined,
      { "task-a": [d1], "task-b": [d1, open] },
    );
    const paperclip = unblockHost(host, "acme", fakeState().state);
    expect(await paperclip.unblock("task-a", "x", "k")).toBe("closed");
    expect(await paperclip.unblock("task-b", "x", "k")).toBe("closed");
    expect(writes).toEqual([]);
  });

  // HAL-20169: set to blocked again during the pass, after its blockers had finished.
  test("writes nothing when the task was set to blocked after its blockers finished", async () => {
    const { host, writes } = fakeHost(
      blockedBehindD1(new Date("2026-11-26T11:00:00.000Z")),
      {},
      undefined,
      { "task-d2": [d1] },
    );
    const { state, saved } = fakeState();
    expect(await unblockHost(host, "acme", state).unblock("task-d2", "x", "k")).toBe("closed");
    expect(writes).toEqual([]);
    expect(saved.size).toBe(0);
  });
});
