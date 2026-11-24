import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { fakeHost } from "./fake-host.test-helper.ts";
import { highOnly, paperclipHost } from "./host.ts";

/** The watcher's only priority change: a `low` or `medium` task to `high` (HAL-17920). */

function issue(priority: string, status = "todo") {
  return { id: "task-1", identifier: "HAL-1", status, assigneeAgentId: "agent-liam", priority };
}

verifies("paperclip.pr-watcher-review-priority", () => {
  test("refuses every task change other than the priority high", () => {
    expect(highOnly({ priority: "high" })).toEqual({ priority: "high" });
    for (const patch of [
      { priority: "critical" },
      { priority: "medium" },
      { priority: "high", status: "todo" },
      { status: "done" },
      {},
    ]) {
      expect(() => highOnly(patch)).toThrow("refusing a priority change other than high");
    }
  });

  test("raises a medium or low task with exactly the priority high, and wakes nobody", async () => {
    for (const priority of ["medium", "low"]) {
      const { host, writes } = fakeHost([issue(priority)]);
      expect(await paperclipHost(host, "acme").raisePriority("task-1", "high")).toBe("written");
      expect(writes).toEqual([{ kind: "update", issueId: "task-1", patch: { priority: "high" } }]);
    }
  });

  test("leaves a task a person raised, or closed, since the pass began", async () => {
    for (const listed of [issue("high"), issue("critical"), issue("medium", "done")]) {
      const { host, writes } = fakeHost([listed]);
      expect(await paperclipHost(host, "acme").raisePriority("task-1", "high")).toBe("closed");
      expect(writes).toEqual([]);
    }
  });

  test("reads each open task's priority", async () => {
    const { host } = fakeHost([issue("low", "in_progress")]);
    const [task] = await paperclipHost(host, "acme").openTasks();
    expect(task?.priority).toBe("low");
  });
});
