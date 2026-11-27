import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { closeGuardsOf, doneOpenHost } from "./done-open-host.ts";
import { fakeHost } from "./fake-host.test-helper.ts";

/** The done-task pass and the close guards on the plugin host (HAL-18284). */

function setUp() {
  return fakeHost([
    { id: "task-4600", identifier: "HAL-4600", status: "done", assigneeAgentId: "agent-mateo" },
    { id: "task-4601", identifier: "HAL-4601", status: "todo", assigneeAgentId: "agent-mateo" },
  ]);
}

verifies("paperclip.pr-watcher-done-open", () => {
  test("reopens a task that is still done: todo, then the comment, then the wake", async () => {
    const { host, writes } = setUp();
    expect(await doneOpenHost(host, "acme").reopen("task-4600", "PR watcher: back", "k")).toBe(
      "written",
    );
    expect(writes.map((write) => write.kind)).toEqual(["update", "comment", "wake"]);
    expect(writes[0]).toEqual({ kind: "update", issueId: "task-4600", patch: { status: "todo" } });
  });

  test("leaves a task that is no longer done alone", async () => {
    const { host, writes } = setUp();
    const adapter = doneOpenHost(host, "acme");
    expect(await adapter.reopen("task-4601", "PR watcher: back", "k")).toBe("closed");
    expect(await adapter.warn("task-4601", "PR watcher: still open")).toBe("closed");
    expect(await adapter.warn("task-4600", "PR watcher: still open")).toBe("written");
    expect(writes).toEqual([
      { kind: "comment", issueId: "task-4600", body: "PR watcher: still open" },
    ]);
  });
});

verifies("paperclip.pr-watcher-close-guards", () => {
  test("reads a board card from the task's status, holder and unanswered cards", async () => {
    const issues = {
      get: async (id: string) =>
        ({
          "task-1": { status: "in_review", assigneeUserId: "user-1" },
          "task-2": { status: "in_progress", assigneeUserId: null },
          "task-3": { status: "in_progress", assigneeUserId: null },
        })[id] ?? null,
      listInteractions: async (id: string) =>
        id === "task-2" ? [{ status: "pending" }] : [{ status: "answered" }],
    };
    const guards = closeGuardsOf({ issues } as never, "acme", { mergeWindowHours: 24 });
    expect(guards.mergeWindowHours).toBe(24);
    expect(closeGuardsOf({ issues } as never, "acme", {}).mergeWindowHours).toBe(12);
    expect(await guards.boardCard("task-1")).toBe(true);
    expect(await guards.boardCard("task-2")).toBe(true);
    expect(await guards.boardCard("task-3")).toBe(false);
  });
});
