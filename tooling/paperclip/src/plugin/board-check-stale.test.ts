import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { Snapshot } from "../snapshot/shape.ts";
import { checkerTask, type FakeTask, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { openPullTasks, roomLeft } from "./board-check-stale.ts";
import { manifest } from "./manifest.ts";

const chiefTask: FakeTask = {
  id: "task-chief",
  identifier: "HAL-100",
  status: "in_progress",
  assigneeAgentId: "agent-chief",
  updatedAt: new Date("2026-11-24T13:00:00Z"),
  monitorNextCheckAt: new Date("2026-11-24T20:00:00Z"),
};

/** A review card the board holds, and a child Chief made that the cycle guard left unassigned. */
const tasks: FakeTask[] = [
  checkerTask,
  chiefTask,
  {
    id: "task-card",
    identifier: "HAL-16411",
    status: "todo",
    assigneeAgentId: null,
    assigneeUserId: "user-board",
    createdAt: new Date("2026-11-22T18:00:00Z"),
    updatedAt: new Date("2026-11-22T18:00:00Z"),
  },
  {
    id: "task-orphan",
    identifier: "HAL-17412",
    status: "todo",
    assigneeAgentId: null,
    assigneeUserId: null,
    parentId: "task-chief",
    createdByAgentId: "agent-chief",
    createdAt: new Date("2026-11-24T09:00:00Z"),
    updatedAt: new Date("2026-11-24T09:00:00Z"),
  },
];

const settings = {
  boardCheckerTask: checkerTask.id,
  chiefTask: chiefTask.id,
  boardCheckWritesForVersion: manifest.version,
};

const noOwnerComments = (sent: { call: string; args: unknown[] }[]) =>
  sent.filter((write) => write.call === "createComment" && String(write.args[1]).includes("owner"));

verifies("paperclip.board-check-stale", () => {
  test("on the hour, wakes Chief once for a cycle-guard orphan and leaves the board's card alone", async () => {
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => settings });
    const board = boardCheck(fake.ctx);
    await board.run(new Date("2026-11-24T14:00:00Z"));
    await board.run(new Date("2026-11-24T15:00:00Z"));
    const comments = noOwnerComments(fake.sent);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.args[0]).toBe(chiefTask.id);
    expect(String(comments[0]?.args[1])).toContain(
      "- HAL-17412: cycle guard, no owner since 24 Nov 10:00 CET",
    );
    expect(String(comments[0]?.args[1])).not.toContain("HAL-16411");
    const wakes = fake.sent.filter((write) => write.call === "requestWakeup");
    expect(wakes).toEqual([
      {
        call: "requestWakeup",
        args: [
          chiefTask.id,
          "acme",
          {
            reason: "board_check_no_owner",
            idempotencyKey: "board-check-no-owner:2026-11-24T14:00:00.000Z",
          },
        ],
      },
    ]);
    expect(fake.state.get("stale")).toMatchObject({
      waitingOnBoard: ["HAL-16411"],
      // The fixture's checker task sits untouched for two days with no run.
      stuck: [checkerTask.identifier],
      woken: ["task-orphan"],
    });
  });

  test("tells Chief on the first hour after the board turns writes on", async () => {
    let config: Record<string, unknown> = { ...settings, boardCheckWritesForVersion: undefined };
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => config });
    const board = boardCheck(fake.ctx);
    await board.run(new Date("2026-11-24T14:00:00Z"));
    config = settings;
    await board.run(new Date("2026-11-24T15:00:00Z"));
    await board.run(new Date("2026-11-24T16:00:00Z"));
    expect(noOwnerComments(fake.sent)).toHaveLength(1);
  });

  test("reads nothing between the hours", async () => {
    const fake = fakeBoardContext({ tasks, comments: {}, config: () => settings });
    await boardCheck(fake.ctx).run(new Date("2026-11-24T14:20:00Z"));
    expect(fake.state.get("stale")).toBeUndefined();
  });

  test("reads the tasks with an open pull request from our own branches in the snapshot", () => {
    const pull = (number: number, branch: string, state: string, headRepo: string | null) => ({
      number,
      branch,
      state,
      headRepo,
    });
    const snapshot = {
      repos: [
        {
          repo: "acme/app",
          pulls: [
            pull(1, "mateo/HAL-1-open", "open", "acme/app"),
            pull(2, "mateo/HAL-2-merged", "merged", "acme/app"),
            pull(3, "mateo/HAL-3-fork", "open", "stranger/app"),
            pull(4, "no-task-here", "open", "acme/app"),
          ],
        },
      ],
    } as unknown as Snapshot;
    expect([...openPullTasks(snapshot)]).toEqual(["HAL-1"]);
    expect(openPullTasks(undefined).size).toBe(0);
  });

  test("counts the room the pass's other writes leave under the ceilings", () => {
    const comment = { kind: "comment", taskId: "t", body: "" } as const;
    expect(roomLeft([comment, comment])).toEqual({ comment: 3, wake: 5 });
  });
});
