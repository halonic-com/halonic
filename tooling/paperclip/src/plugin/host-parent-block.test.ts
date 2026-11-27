import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type FakeIssue, fakeHost, fakeState } from "./fake-host.test-helper.ts";
import { unblockHost } from "./unblock-host.ts";

const owen = "agent-owen";
const epic = { id: "task-epic", identifier: "HAL-17956", status: "in_progress" };
const sibling = { id: "task-sib", identifier: "HAL-18143", status: "in_progress" };

/** HAL-18142 under HAL-17956, blocked by the blockers given. */
function tree(status = "blocked"): FakeIssue[] {
  return [
    { id: "task-epic", identifier: "HAL-17956", status: "in_progress", assigneeAgentId: null },
    {
      id: "task-child",
      identifier: "HAL-18142",
      status,
      assigneeAgentId: owen,
      parentId: "task-epic",
    },
  ];
}

verifies("paperclip.pr-watcher-parent-block", () => {
  test("reads a task's parent", async () => {
    const paperclip = unblockHost(fakeHost(tree()).host, "acme", fakeState().state);
    expect(await paperclip.parentOf("task-child")).toBe("task-epic");
    expect(await paperclip.parentOf("task-epic")).toBeNull();
  });

  test("removes the parent link, sets todo, comments, then wakes the agent", async () => {
    const { host, writes } = fakeHost(tree(), {}, undefined, { "task-child": [epic] });
    expect(
      await unblockHost(host, "acme", fakeState().state).releaseParentBlock("task-child", [epic]),
    ).toBe("todo");
    expect(writes).toEqual([
      { kind: "unlink", issueId: "task-child", blockerIds: ["task-epic"] },
      { kind: "update", issueId: "task-child", patch: { status: "todo" } },
      { kind: "comment", issueId: "task-child", body: expect.stringContaining("HAL-17956") },
      {
        kind: "wake",
        issueId: "task-child",
        options: {
          reason: "parent_block",
          idempotencyKey: "pr-watcher task-child parent-block task-epic",
        },
      },
    ]);
  });

  test("keeps the task blocked, and wakes nobody, while another blocker is unfinished", async () => {
    const { host, writes } = fakeHost(tree(), {}, undefined, { "task-child": [epic, sibling] });
    expect(
      await unblockHost(host, "acme", fakeState().state).releaseParentBlock("task-child", [epic]),
    ).toBe("blocked");
    expect(writes.map((write) => write.kind)).toEqual(["unlink", "comment"]);
  });

  test("writes nothing when the task moved, or the link is gone, by the time of the write", async () => {
    const moved = fakeHost(tree("todo"), {}, undefined, { "task-child": [epic] });
    expect(
      await unblockHost(moved.host, "acme", fakeState().state).releaseParentBlock("task-child", [
        epic,
      ]),
    ).toBe("closed");
    const unlinked = fakeHost(tree(), {}, undefined, { "task-child": [sibling] });
    expect(
      await unblockHost(unlinked.host, "acme", fakeState().state).releaseParentBlock("task-child", [
        epic,
      ]),
    ).toBe("closed");
    expect([...moved.writes, ...unlinked.writes]).toEqual([]);
  });

  test("never removes a blocker that isn't above the task", async () => {
    const { host, writes } = fakeHost(tree(), {}, undefined, { "task-child": [sibling] });
    expect(
      await unblockHost(host, "acme", fakeState().state).releaseParentBlock("task-child", [
        sibling,
      ]),
    ).toBe("closed");
    expect(writes).toEqual([]);
  });
});
