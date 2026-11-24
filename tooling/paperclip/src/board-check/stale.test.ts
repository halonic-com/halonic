import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { emptyStale, planStale, readStale, type StaleTask, staleVerdict } from "./stale.ts";

const now = new Date("2026-11-24T18:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

const task = (overrides: Partial<StaleTask>): StaleTask => ({
  id: "task-1",
  identifier: "HAL-1",
  status: "todo",
  assigneeAgentId: "agent-mateo",
  assigneeUserId: null,
  createdAt: hoursAgo(48),
  updatedAt: hoursAgo(48),
  ...overrides,
});

const nobody = { assigneeAgentId: null, assigneeUserId: null };
const room = { comment: 5, wake: 5 };

verifies("paperclip.board-check-stale", () => {
  test.each([
    ["a todo the board holds", task({ assigneeAgentId: null, assigneeUserId: "user-1" })],
    [
      "a review card the board holds",
      task({ status: "in_review", assigneeAgentId: null, assigneeUserId: "user-1" }),
    ],
    [
      "a task in progress the board holds",
      task({ status: "in_progress", assigneeAgentId: null, assigneeUserId: "user-1" }),
    ],
  ])("%s waits on the board, never stuck, slow or ownerless", (_name, board) => {
    expect(staleVerdict(board, now)).toEqual({ kind: "waiting_on_board" });
  });

  test.each([
    ["a stated unblock", task({ status: "blocked", unblockDescriptor: { owner: {} } })],
    ["a routine's run", task({ status: "in_progress", originKind: "routine_execution" })],
    ["a standing monitor", task({ status: "in_progress", monitorNextCheckAt: hoursAgo(-1) })],
    ["an ownerless todo with a monitor", task({ ...nobody, monitorNextCheckAt: hoursAgo(-1) })],
  ])("skips a task with %s", (_name, standing) => {
    expect(staleVerdict(standing, now)).toEqual({ kind: "standing" });
  });

  test("names the reason for a todo with no owner from 4 hours on", () => {
    const child = { parentId: "task-parent", createdByAgentId: "agent-chief" };
    expect(staleVerdict(task({ ...nobody, ...child, createdAt: hoursAgo(5) }), now)).toEqual({
      kind: "no_owner",
      reason: "cycle guard",
    });
    expect(staleVerdict(task({ ...nobody, createdAt: hoursAgo(5) }), now)).toEqual({
      kind: "no_owner",
      reason: "missing assignee",
    });
    expect(staleVerdict(task({ ...nobody, createdAt: hoursAgo(3) }), now)).toEqual({
      kind: "fine",
    });
    expect(staleVerdict(task({ ...nobody, status: "backlog" }), now)).toEqual({ kind: "fine" });
  });

  test("finds an agent's slow review after 8 hours and a stuck task after 24", () => {
    expect(staleVerdict(task({ status: "in_review", updatedAt: hoursAgo(9) }), now).kind).toBe(
      "slow_review",
    );
    expect(staleVerdict(task({ status: "in_progress", updatedAt: hoursAgo(25) }), now).kind).toBe(
      "stuck",
    );
    const running = task({ status: "in_progress", activeRun: { id: "run-1" } });
    expect(staleVerdict(running, now).kind).toBe("fine");
    expect(staleVerdict(task({ updatedAt: hoursAgo(2) }), now).kind).toBe("fine");
  });

  test("wakes Chief once for a no-owner todo, and again only after it had an owner", () => {
    const ownerless = task({ ...nobody, identifier: "HAL-9", createdAt: hoursAgo(5) });
    const options = { chiefTaskId: "task-chief", room, now };
    const first = planStale(emptyStale, [ownerless], options);
    expect(first.writes).toEqual([
      {
        kind: "comment",
        taskId: "task-chief",
        body: `Todos with no owner for 4 hours or more; please pick one:\n- HAL-9: missing assignee, no owner since ${hoursAgo(5).toISOString()}`,
      },
      expect.objectContaining({
        kind: "wake",
        taskId: "task-chief",
        reason: "board_check_no_owner",
      }),
    ]);
    const saved = readStale(JSON.parse(JSON.stringify(first.record)));
    expect(planStale(saved, [ownerless], options).writes).toEqual([]);
    const owned = planStale(saved, [{ ...ownerless, assigneeAgentId: "agent-mateo" }], options);
    expect(planStale(owned.record, [ownerless], options).writes).toHaveLength(2);
  });

  test("keeps a task unreported when the writes only got logged or had no room", () => {
    const ownerless = task({ ...nobody, createdAt: hoursAgo(5) });
    const sent = planStale(emptyStale, [ownerless], { chiefTaskId: "task-chief", room, now });
    expect(sent.recordIfUnsent.woken).toEqual([]);
    const full = { comment: 0, wake: 5 };
    const crowded = planStale(emptyStale, [ownerless], {
      chiefTaskId: "task-chief",
      room: full,
      now,
    });
    expect(crowded.writes).toEqual([]);
    expect(crowded.record.woken).toEqual([]);
    expect(crowded.record.noOwner).toHaveLength(1);
  });

  test("keeps every verdict's list as identifiers", () => {
    const tasks = [
      task({ id: "a", identifier: "HAL-1", assigneeAgentId: null, assigneeUserId: "user-1" }),
      task({ id: "b", identifier: "HAL-2", status: "in_progress" }),
      task({ id: "c", identifier: "HAL-3", status: "in_review" }),
    ];
    const plan = planStale(emptyStale, tasks, { chiefTaskId: undefined, room, now });
    expect(plan.record).toMatchObject({
      waitingOnBoard: ["HAL-1"],
      stuck: ["HAL-2"],
      slowReview: ["HAL-3"],
      noOwner: [],
    });
  });
});
