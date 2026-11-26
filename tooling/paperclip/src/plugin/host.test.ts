import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { fakeHost } from "./fake-host.test-helper.ts";
import { doneOnly, type HostApi, handoffOnly, paperclipHost } from "./host.ts";

const srcDir = fileURLToPath(new URL("..", import.meta.url));

/** One open task, as the watcher saw it when the pass began. */
const openTask = {
  id: "task-1",
  identifier: "HAL-1",
  status: "in_progress",
  assigneeAgentId: null,
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith(".ts") && !entry.name.includes(".test") ? [path] : [];
  });
}

verifies("paperclip.pr-watcher-plugin", () => {
  test("refuses every task change other than setting the status to done", () => {
    expect(doneOnly({ status: "done" })).toEqual({ status: "done" });
    for (const patch of [
      { status: "todo" },
      { status: "cancelled" },
      { status: "done", assigneeAgentId: "agent-liam" },
      { title: "renamed" },
      {},
    ]) {
      expect(() => doneOnly(patch)).toThrow("refusing a task change other than done");
    }
  });

  test("changes a task's status only in the host adapter", () => {
    const writers = sourceFiles(srcDir)
      .filter((file) => readFileSync(file, "utf8").includes("issues.update("))
      .map((file) => relative(srcDir, file));
    expect(writers).toEqual(["plugin/host.ts"]);
  });

  test("creates tasks only in the chief line's findOrCreateThread", () => {
    const creators = sourceFiles(srcDir)
      .filter((file) => /\bissues\.create\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(srcDir, file));
    expect(creators).toEqual(["plugin/chief-line.ts"]);
  });

  test("marks a task done with exactly the done status, then comments", async () => {
    const { host, writes } = fakeHost([openTask]);
    expect(await paperclipHost(host, "acme").markDone("task-1", "PR watcher: done.")).toBe(
      "written",
    );
    expect(writes).toEqual([
      { kind: "update", issueId: "task-1", patch: { status: "done" } },
      { kind: "comment", issueId: "task-1", body: "PR watcher: done." },
    ]);
  });
});

verifies("paperclip.pr-watcher-monitor-postpone", () => {
  test("moves a monitor through the host's postpone call and nothing else", async () => {
    const { host, writes } = fakeHost([openTask]);
    const until = "2026-11-23T16:00:00.000Z";
    expect(await paperclipHost(host, "acme").postponeMonitor("task-1", until)).toBe("postponed");
    expect(writes).toEqual([{ kind: "postpone", issueId: "task-1", until }]);
  });
});

verifies("paperclip.pr-watcher-handoff", () => {
  const authorsTask = { ...openTask, assigneeAgentId: "agent-mateo" };
  const change = { from: "agent-mateo", to: "agent-julian" };

  test("refuses every handoff other than to one agent with status todo", () => {
    expect(handoffOnly({ assigneeAgentId: "agent-julian", status: "todo" })).toEqual({
      assigneeAgentId: "agent-julian",
      status: "todo",
    });
    for (const patch of [
      { assigneeAgentId: "agent-julian", status: "in_review" },
      { assigneeAgentId: "", status: "todo" },
      { assigneeAgentId: null, status: "todo" },
      { assigneeAgentId: "agent-julian", status: "todo", title: "renamed" },
      { status: "todo" },
    ]) {
      expect(() => handoffOnly(patch)).toThrow("refusing a handoff other than");
    }
  });

  test("gives the task to the reviewer with status todo, then comments and wakes them", async () => {
    const { host, writes } = fakeHost([authorsTask]);
    const body = "PR watcher: ready for review: #5701, head `5701aaa`.";
    expect(await paperclipHost(host, "acme").handOff("task-1", change, body, "k1")).toBe("written");
    expect(writes).toEqual([
      {
        kind: "update",
        issueId: "task-1",
        patch: { assigneeAgentId: "agent-julian", status: "todo" },
      },
      { kind: "comment", issueId: "task-1", body },
      {
        kind: "wake",
        issueId: "task-1",
        options: { reason: "pr_watcher", idempotencyKey: "pr-watcher task-1 k1" },
      },
    ]);
  });

  test("posts no comment, so no once-per-head marker, when the reassignment fails", async () => {
    // HAL-17690: the marker in the comment keeps the head from being handed off again.
    const { host, writes } = fakeHost([authorsTask]);
    const refusing: HostApi = {
      ...host,
      issues: {
        ...host.issues,
        update: async () => {
          throw new Error("Paperclip refused the change");
        },
      },
    };
    const body = "PR watcher: ready for review: #5701, head `5701aaa`.";
    await expect(
      paperclipHost(refusing, "acme").handOff("task-1", change, body, "k1"),
    ).rejects.toThrow("Paperclip refused the change");
    expect(writes).toEqual([]);
    // The next pass hands the same head off.
    expect(await paperclipHost(host, "acme").handOff("task-1", change, body, "k1")).toBe("written");
    expect(writes.filter(({ kind }) => kind === "comment")).toEqual([
      { kind: "comment", issueId: "task-1", body },
    ]);
  });

  test("leaves a task its author handed on, closed or started a run on since the pass began", async () => {
    for (const moved of [
      { ...authorsTask, assigneeAgentId: "agent-liam" },
      { ...authorsTask, status: "done" },
      { ...authorsTask, activeRun: { id: "run-1" } },
    ]) {
      const { host, writes } = fakeHost([moved]);
      expect(
        await paperclipHost(host, "acme").handOff("task-1", change, "PR watcher: x", "k1"),
      ).toBe("closed");
      expect(writes).toEqual([]);
    }
  });

  test("moves a limited reviewer's task over a queued or parked run, never a working one", async () => {
    // HAL-19203: the move cancels the queued run; a run going stays untouched.
    for (const status of ["queued", "scheduled_retry"]) {
      const { host, writes } = fakeHost([{ ...authorsTask, activeRun: { id: "run-1", status } }]);
      const paperclip = paperclipHost(host, "acme");
      const options = { overQueuedRun: true };
      expect(await paperclip.handOff("task-1", change, "PR watcher: x", "k1", options)).toBe(
        "written",
      );
      expect(writes[0]).toMatchObject({ kind: "update", patch: { status: "todo" } });
    }
    for (const activeRun of [{ id: "run-1", status: "running" }, { id: "run-1" }]) {
      const { host, writes } = fakeHost([{ ...authorsTask, activeRun }]);
      const paperclip = paperclipHost(host, "acme");
      const options = { overQueuedRun: true };
      expect(await paperclip.handOff("task-1", change, "PR watcher: x", "k1", options)).toBe(
        "closed",
      );
      expect(writes).toEqual([]);
    }
  });

  test("posts a note as a comment only, waking nobody", async () => {
    const { host, writes } = fakeHost([authorsTask]);
    expect(
      await paperclipHost(host, "acme").note("task-1", "PR watcher: pushed after approval."),
    ).toBe("written");
    expect(writes).toEqual([
      { kind: "comment", issueId: "task-1", body: "PR watcher: pushed after approval." },
    ]);
  });
});

describe("the host adapter", () => {
  test("comments, then wakes the assignee with a key per state", async () => {
    const { host, writes } = fakeHost([openTask]);
    expect(
      await paperclipHost(host, "acme").wake("task-1", "PR watcher: this needs you.", "k1 | k2"),
    ).toBe("written");
    expect(writes).toEqual([
      { kind: "comment", issueId: "task-1", body: "PR watcher: this needs you." },
      {
        kind: "wake",
        issueId: "task-1",
        options: { reason: "pr_watcher", idempotencyKey: "pr-watcher task-1 k1 | k2" },
      },
    ]);
  });

  test("writes nothing to a task that was closed since the pass began", async () => {
    const { host, writes } = fakeHost([{ ...openTask, status: "done" }]);
    const paperclip = paperclipHost(host, "acme");
    expect(await paperclip.wake("task-1", "PR watcher: this needs you.", "k1")).toBe("closed");
    expect(await paperclip.markDone("task-1", "PR watcher: done.")).toBe("closed");
    expect(writes).toEqual([]);
  });

  test("takes the host's refusal to wake a closed task as closed, and throws on others", async () => {
    // HAL-16139, 22 Nov: closed between the re-read and the wake-up.
    const closed = fakeHost([openTask], {}, "Issue is not wakeable in status: done");
    expect(await paperclipHost(closed.host, "acme").wake("task-1", "PR watcher: x", "k1")).toBe(
      "closed",
    );
    const broken = fakeHost([openTask], {}, "Paperclip is down");
    await expect(
      paperclipHost(broken.host, "acme").wake("task-1", "PR watcher: x", "k1"),
    ).rejects.toThrow("Paperclip is down");
  });

  test("watches open tasks, blocked ones too, and sees an unfinished child of any open status", async () => {
    const { host } = fakeHost([
      { id: "a", identifier: "HAL-1", status: "in_review", assigneeAgentId: "agent-liam" },
      { id: "b", identifier: "HAL-2", status: "todo", assigneeAgentId: "agent-priya" },
      { id: "c", identifier: "HAL-3", status: "blocked", assigneeAgentId: null, parentId: "a" },
      {
        id: "d",
        identifier: "HAL-4",
        status: "in_progress",
        assigneeAgentId: "agent-mateo",
        activeRun: { id: "run-1" },
      },
      { id: "e", identifier: "HAL-5", status: "done", assigneeAgentId: null, parentId: "b" },
    ]);
    const tasks = await paperclipHost(host, "acme").openTasks();
    expect(
      tasks.map(({ identifier, openChildren, running }) => [identifier, openChildren, running]),
    ).toEqual([
      ["HAL-2", false, false],
      ["HAL-4", false, true],
      ["HAL-1", true, false],
      ["HAL-3", false, false],
    ]);
  });

  test("reads comments with their authors and an ISO time", async () => {
    const createdAt = new Date("2026-11-22T07:00:00Z");
    const { host } = fakeHost([], {
      "task-1": [{ authorAgentId: null, authorUserId: "user-1", createdAt, body: "Hi" }],
    });
    expect(await paperclipHost(host, "acme").comments("task-1")).toEqual([
      {
        authorAgentId: null,
        authorUserId: "user-1",
        createdAt: "2026-11-22T07:00:00.000Z",
        body: "Hi",
      },
    ]);
  });
});
