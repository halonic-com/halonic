import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { fakeHost } from "./fake-host.test-helper.ts";
import { todoOnly, unblockHost } from "./host.ts";

const owen = "agent-owen";
const d1 = { id: "task-d1", identifier: "HAL-17445", status: "done" };

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

  test("lists only blocked tasks, with their blockers", async () => {
    const { host } = fakeHost(
      [
        { id: "task-d2", identifier: "HAL-17446", status: "blocked", assigneeAgentId: owen },
        { id: "task-x", identifier: "HAL-9", status: "in_progress", assigneeAgentId: owen },
      ],
      {},
      undefined,
      { "task-d2": [d1] },
    );
    const paperclip = unblockHost(host, "acme");
    expect(await paperclip.blockedTasks()).toEqual([
      { id: "task-d2", identifier: "HAL-17446", assigneeAgentId: owen, running: false },
    ]);
    expect(await paperclip.blockers("task-d2")).toEqual([d1]);
  });

  test("sets todo, then comments, then wakes the agent once per set of blockers", async () => {
    const { host, writes } = fakeHost(
      [{ id: "task-d2", identifier: "HAL-17446", status: "blocked", assigneeAgentId: owen }],
      {},
      undefined,
      { "task-d2": [d1] },
    );
    expect(await unblockHost(host, "acme").unblock("task-d2", "PR watcher: unblocked.", "k")).toBe(
      "written",
    );
    expect(writes).toEqual([
      { kind: "update", issueId: "task-d2", patch: { status: "todo" } },
      { kind: "comment", issueId: "task-d2", body: "PR watcher: unblocked." },
      {
        kind: "wake",
        issueId: "task-d2",
        options: { reason: "blockers_finished", idempotencyKey: "pr-watcher task-d2 k" },
      },
    ]);
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
    const paperclip = unblockHost(host, "acme");
    expect(await paperclip.unblock("task-a", "x", "k")).toBe("closed");
    expect(await paperclip.unblock("task-b", "x", "k")).toBe("closed");
    expect(writes).toEqual([]);
  });
});
