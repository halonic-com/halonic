import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import { now, pull, repo } from "../fast-track/fast-track.test-helper.ts";
import { fakeHost, fakeJobContext } from "../plugin/fake-host.test-helper.ts";
import type { TaskRow } from "../pr-watcher/paperclip.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import { readWatchersSettings, runMergeWatchers, type WatchersSettings } from "./run.ts";

function at(minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

const snapshot: Snapshot = {
  version: 1,
  takenAt: now.toISOString(),
  closedWindowDays: 3,
  repos: [
    repo([
      // Waits only for Julian's review: Liam wrote it.
      pull(501, { labels: [] }, { branch: "liam/HAL-501-thing" }),
      // Waits only for Nora's review: a routine pull request (HAL-19653).
      pull(504, { labels: [], reviewer: "Nora" }),
      // Red on its head.
      pull(502, { labels: [], ciOk: "failure" }),
      // Red too, but its task waits on a blocker.
      pull(503, { labels: [], ciOk: "failure" }),
    ] satisfies SnapshotPull[]),
  ],
};

const blockedTask: TaskRow = {
  id: "task-503",
  identifier: "HAL-503",
  assigneeAgentId: "agent-mateo",
  running: false,
  openChildren: false,
  monitorNextCheckAt: null,
  monitorLastTriggeredAt: null,
  parked: true,
  blocked: true,
};

const live: WatchersSettings = {
  dryRun: false,
  wakeTasks: { Liam: "task-liam-chat", Julian: "task-julian-chat", Nora: "task-nora-chat" },
  unhandledTask: "task-chief-chat",
  handQueueBranches: [],
};

function setup() {
  const { host, writes } = fakeHost([], {}, undefined, {
    "task-503": [{ id: "task-9", identifier: "HAL-9", status: "in_progress" }],
  });
  const job = fakeJobContext({ host, configs: { acme: {} }, answers: {} });
  return { ...job, writes };
}

async function runAt(
  context: ReturnType<typeof setup>,
  minutes: number,
  settings: WatchersSettings,
): Promise<void> {
  await runMergeWatchers(context.ctx, {
    companyId: "acme",
    snapshot,
    repo: "acme/tools",
    settings,
    tasks: [blockedTask],
    found: new Map([
      ["HAL-503", [{ repo: "acme/tools", number: 503, branch: "mateo/HAL-503-thing" }]],
    ]),
    now: at(minutes),
  });
}

verifies("paperclip.merge-watchers-reviewer-wake", () => {
  test("wakes the reviewer's chat task once and sends no GitHub request", async () => {
    const context = setup();
    for (const minutes of [0, 60, 70]) {
      await runAt(context, minutes, live);
    }
    expect(context.sent).toEqual([]);
    expect(context.writes.map((write) => [write.kind, write.issueId])).toEqual([
      ["comment", "task-julian-chat"],
      ["wake", "task-julian-chat"],
      ["comment", "task-nora-chat"],
      ["wake", "task-nora-chat"],
    ]);
  });

  test("reads its settings, dry run unless turned off", () => {
    expect(readWatchersSettings({})).toEqual({
      dryRun: true,
      wakeTasks: { Liam: "", Julian: "", Nora: "" },
      unhandledTask: "",
      handQueueBranches: [],
    });
    expect(
      readWatchersSettings({
        mergeWatchersDryRun: false,
        liamWakeTask: " a ",
        julianWakeTask: "b",
        noraWakeTask: "c",
        unhandledTask: 7,
        handQueueBranches: [" board/ ", 3, ""],
      }),
    ).toEqual({
      dryRun: false,
      wakeTasks: { Liam: "a", Julian: "b", Nora: "c" },
      unhandledTask: "",
      handQueueBranches: ["board/"],
    });
  });
});

verifies("paperclip.merge-watchers-unhandled", () => {
  test("reports to the UNHANDLED task once, leaves a blocked task alone and sends no GitHub request", async () => {
    const context = setup();
    for (const minutes of [0, 360, 370]) {
      await runAt(context, minutes, {
        ...live,
        wakeTasks: { Liam: "", Julian: "", Nora: "" },
        dryRun: false,
      });
    }
    expect(context.sent).toEqual([]);
    const chief = context.writes.filter((write) => write.issueId === "task-chief-chat");
    expect(chief.map((write) => write.kind)).toEqual(["comment", "wake"]);
    const [comment] = chief;
    expect(comment?.kind === "comment" ? comment.body : "").toContain("acme/tools#502");
    expect(comment?.kind === "comment" ? comment.body : "").not.toContain("#503");
  });

  test("in a dry run only logs, and writes nothing", async () => {
    const context = setup();
    for (const minutes of [0, 360]) {
      await runAt(context, minutes, { ...live, dryRun: true });
    }
    expect(context.sent).toEqual([]);
    expect(context.writes).toEqual([]);
    expect(context.logs.map((log) => log.message.split(":")[0])).toEqual([
      "Reviewer wake for Julian (dry run)",
      "Reviewer wake for Nora (dry run)",
      "UNHANDLED report (dry run)",
    ]);
  });
});

/** #600 merged; #601 above it moved to `main` with a conflict, its task blocked. */
const stacked: Snapshot = {
  ...snapshot,
  repos: [
    repo([
      pull(
        601,
        {
          labels: [],
          mergeable: "no",
          baseChangedSincePush: true,
          previousBase: "mateo/HAL-600-base",
        },
        { branch: "mateo/HAL-601-thing" },
      ),
      { ...pull(600), branch: "mateo/HAL-600-base", state: "merged", open: null },
    ] satisfies SnapshotPull[]),
  ],
};

verifies("paperclip.merge-watchers-author-nudge", () => {
  test("watcher pass makes zero read calls on the write client", async () => {
    const { host, writes } = fakeHost([
      { id: "task-601", identifier: "HAL-601", status: "blocked", assigneeAgentId: "agent-mateo" },
    ]);
    const context = fakeJobContext({ host, configs: { acme: {} }, answers: {} });
    const globalFetch = vi.spyOn(globalThis, "fetch");
    for (const minutes of [0, 10]) {
      await runMergeWatchers(context.ctx, {
        companyId: "acme",
        snapshot: stacked,
        repo: "acme/tools",
        settings: live,
        tasks: [{ ...blockedTask, id: "task-601", identifier: "HAL-601" }],
        found: new Map([
          ["HAL-601", [{ repo: "acme/tools", number: 601, branch: "mateo/HAL-601-thing" }]],
        ]),
        now: at(minutes),
      });
    }
    expect(context.sent).toEqual([]);
    expect(globalFetch).not.toHaveBeenCalled();
    // Merge control's read and write clients need a resolved token: none was resolved.
    expect(context.resolved).toEqual([]);
    expect(context.logs.filter((log) => log.level === "error")).toEqual([]);
    // Set to todo, then one comment and one wake, for the first pass only.
    expect(writes.map((write) => [write.kind, write.issueId])).toEqual([
      ["update", "task-601"],
      ["comment", "task-601"],
      ["wake", "task-601"],
    ]);
    const comment = writes.find((write) => write.kind === "comment");
    expect(comment?.kind === "comment" ? comment.body : "").toContain("conflict with `main`");
    globalFetch.mockRestore();
  });
});
