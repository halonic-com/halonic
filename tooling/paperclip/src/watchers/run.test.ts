import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
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
  wakeTasks: { Liam: "task-liam-chat", Julian: "task-julian-chat" },
  unhandledTask: "task-chief-chat",
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
    ]);
  });

  test("reads its settings, dry run unless turned off", () => {
    expect(readWatchersSettings({})).toEqual({
      dryRun: true,
      wakeTasks: { Liam: "", Julian: "" },
      unhandledTask: "",
    });
    expect(
      readWatchersSettings({
        mergeWatchersDryRun: false,
        liamWakeTask: " a ",
        julianWakeTask: "b",
        unhandledTask: 7,
      }),
    ).toEqual({ dryRun: false, wakeTasks: { Liam: "a", Julian: "b" }, unhandledTask: "" });
  });
});

verifies("paperclip.merge-watchers-unhandled", () => {
  test("reports to the UNHANDLED task once, leaves a blocked task alone and sends no GitHub request", async () => {
    const context = setup();
    for (const minutes of [0, 360, 370]) {
      await runAt(context, minutes, {
        ...live,
        wakeTasks: { Liam: "", Julian: "" },
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
      "UNHANDLED report (dry run)",
    ]);
  });
});
