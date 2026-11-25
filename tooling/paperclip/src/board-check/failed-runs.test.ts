import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  causeOf,
  emptyRecord,
  type FailedRun,
  planFailedRuns,
  readFailedRun,
  readRecord,
  recordFailure,
} from "./failed-runs.ts";

const now = new Date("2026-11-22T14:00:00Z");
const names = new Map([
  ["agent-mateo", "Mateo"],
  ["agent-priya", "Priya"],
]);

const run = (runId: string, overrides: Partial<FailedRun> = {}): FailedRun => ({
  runId,
  agentId: "agent-mateo",
  taskId: "task-1",
  cause: "no_identity",
  at: "2026-11-22T13:55:00.000Z",
  ...overrides,
});

verifies("paperclip.board-check-failed-runs", () => {
  test.each([
    [{ status: "timed_out", errorCode: null, error: "anything" }, "timeout"],
    [
      { status: "failed", errorCode: null, error: "No managed GitHub identity is available" },
      "no_identity",
    ],
    [
      { status: "failed", errorCode: null, error: "Spend limit reached for this seat" },
      "spend_limit",
    ],
    [{ status: "failed", errorCode: null, error: "You're out of extra usage" }, "spend_limit"],
    [{ status: "failed", errorCode: "adapter_failed", error: null }, "adapter_error"],
    [{ status: "failed", errorCode: null, error: "Process exited with code 137" }, "adapter_error"],
    [{ status: "failed", errorCode: null, error: "Something odd" }, "other"],
    [{ status: "failed", errorCode: 42, error: { nested: true } }, "other"],
  ])("sorts %o into %s", (failure, cause) => {
    expect(causeOf(failure)).toBe(cause);
  });

  test("reads a failed run from the event as ids and a cause code, without the error text", () => {
    const run = readFailedRun({
      entityId: "run-7",
      occurredAt: "2026-11-22T13:55:00Z",
      payload: {
        agentId: "agent-mateo",
        contextSnapshot: { issueId: "task-1" },
        status: "failed",
        error: "No managed GitHub identity is available (token ghp_made_up_value)",
      },
    });
    expect(run).toEqual({
      runId: "run-7",
      agentId: "agent-mateo",
      taskId: "task-1",
      cause: "no_identity",
      at: "2026-11-22T13:55:00.000Z",
    });
    expect(
      readFailedRun({ occurredAt: now.toISOString(), payload: { status: "failed" } }),
    ).toBeUndefined();
  });

  test("keeps each run once, starts counting at the first one and drops runs after two days", () => {
    const old = run("run-old", { at: "2026-11-20T10:00:00.000Z", taskId: "task-9" });
    let record = recordFailure(emptyRecord, old, new Date("2026-11-20T10:00:00Z"));
    record = { ...record, woken: ["task-9"] };
    record = recordFailure(record, run("run-1"), now);
    record = recordFailure(record, run("run-1"), now);
    expect(record.since).toBe("2026-11-20T10:00:00.000Z");
    expect(record.runs.map((kept) => kept.runId)).toEqual(["run-1"]);
    expect(record.woken).toEqual([]);
    expect(readRecord({ runs: [{ runId: 1 }], woken: "x" })).toEqual(emptyRecord);
  });

  test("wakes each task without a GitHub identity once, at most the wakes left this pass", () => {
    const runs = ["1", "2", "3"].map((n) => run(`run-${n}`, { taskId: `task-${n}` }));
    const record = { ...emptyRecord, runs: [...runs, run("run-4", { taskId: "task-1" })] };
    const first = planFailedRuns(record, { wakes: 2, seatSupervisorTaskId: undefined, names });
    expect(first.writes).toEqual([
      {
        kind: "wake",
        taskId: "task-1",
        reason: "board_check_no_identity",
        key: "board-check no_identity task-1",
      },
      {
        kind: "wake",
        taskId: "task-2",
        reason: "board_check_no_identity",
        key: "board-check no_identity task-2",
      },
    ]);
    const second = planFailedRuns(first.record, {
      wakes: 4,
      seatSupervisorTaskId: undefined,
      names,
    });
    expect(second.writes.map((write) => write.kind === "wake" && write.taskId)).toEqual(["task-3"]);
    expect(
      planFailedRuns(second.record, { wakes: 4, seatSupervisorTaskId: undefined, names }).writes,
    ).toEqual([]);
  });

  test("reports new spend-limit failures in one line on the Seat Supervisor's task, once", () => {
    const record = {
      ...emptyRecord,
      runs: [
        run("run-1", { cause: "spend_limit" }),
        run("run-2", {
          cause: "spend_limit",
          agentId: "agent-priya",
          at: "2026-11-22T13:58:00.000Z",
        }),
      ],
    };
    const plan = planFailedRuns(record, { wakes: 5, seatSupervisorTaskId: "task-seats", names });
    expect(plan.writes).toEqual([
      {
        kind: "comment",
        taskId: "task-seats",
        body: "Spend-limit failures: 2 runs since 22 Nov 14:55 CET (Mateo, Priya).",
      },
    ]);
    expect(
      planFailedRuns(plan.record, { wakes: 5, seatSupervisorTaskId: "task-seats", names }).writes,
    ).toEqual([]);
    // Without the Seat Supervisor's task set, nothing is reported, and nothing is marked reported.
    const unset = planFailedRuns(record, { wakes: 5, seatSupervisorTaskId: undefined, names });
    expect([unset.writes, unset.record.reported]).toEqual([[], []]);
  });
});
