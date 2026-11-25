import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { calibratedOn } from "./coefficients.ts";
import {
  type DecisionEntry,
  decisionLine,
  MemoryDecisionLog,
  type Outcome,
  readDecisionLines,
  type ShipChosen,
} from "./decision-log.ts";
import { weeklyMetrics, weekStart } from "./weekly-metrics.ts";

function ship(taskId: string, at: string, attempt: number | null, attempts = 1): ShipChosen {
  return {
    kind: "ship",
    taskId,
    at,
    attempt,
    attempts,
    costUsd: 0.05 * attempts,
    waitSeconds: 300,
  };
}

function outcome(taskId: string, at: string, result: Outcome): DecisionEntry {
  return { kind: "outcome", taskId, at, outcome: result };
}

const taskLog: DecisionEntry[] = [
  {
    kind: "attempt-started",
    taskId: "t1",
    at: "2026-11-24T10:00:00Z",
    attempt: 1,
    reason: "first",
    setup: calibratedOn,
  },
  {
    kind: "checkpoint",
    taskId: "t1",
    at: "2026-11-24T10:03:00Z",
    attempt: 1,
    minute: 3,
    features: { steps: 4, edited_any: 0 },
    pFail: 0.62,
    spawnAt: 0.5,
    stopAt: 0.85,
    spawned: true,
    stopped: false,
  },
  {
    kind: "attempt-started",
    taskId: "t1",
    at: "2026-11-24T10:03:00Z",
    attempt: 2,
    reason: "spawn",
    setup: calibratedOn,
    spawnedBy: 1,
  },
  {
    kind: "attempt-finished",
    taskId: "t1",
    at: "2026-11-24T10:08:00Z",
    attempt: 2,
    features: { turns: 9 },
    pFail: 0.2,
    flagged: false,
    costUsd: 0.04,
    seconds: 300,
  },
  {
    kind: "attempt-stopped",
    taskId: "t1",
    at: "2026-11-24T10:08:00Z",
    attempt: 1,
    reason: "shipped-other",
    costUsd: 0.05,
    seconds: 480,
  },
  ship("t1", "2026-11-24T10:08:00Z", 2, 2),
];

verifies("retry-detectors.decision-log", () => {
  describe("decisionLine and readDecisionLines", () => {
    it("reads back every entry it wrote, one JSON line each", () => {
      const text = taskLog.map(decisionLine).join("");
      expect(text.split("\n")).toHaveLength(taskLog.length + 1);
      expect(readDecisionLines(text)).toEqual({ entries: taskLog, skipped: 0 });
    });

    it("skips and counts a torn line, an unknown kind and a line without a task", () => {
      const text = [
        decisionLine(taskLog[0] as DecisionEntry),
        '{"kind":"guess","taskId":"t1","at":"x"}\n',
        '{"kind":"ship","at":"x"}\n',
        "[1]\n",
        "\n",
        '{"kind":"ship","taskId":"t1","at":"2026-1',
      ].join("");
      expect(readDecisionLines(text)).toEqual({ entries: [taskLog[0]], skipped: 4 });
    });
  });

  describe("MemoryDecisionLog", () => {
    it("keeps entries in the order they were appended", async () => {
      const log = new MemoryDecisionLog();
      for (const entry of taskLog) await log.append(entry);
      expect(log.entries).toEqual(taskLog);
    });
  });
});

verifies("retry-detectors.weekly-metrics", () => {
  describe("weekStart", () => {
    it("gives the Monday of the week in UTC", () => {
      expect(weekStart("2026-11-23T00:00:00Z")).toBe("2026-11-23");
      expect(weekStart("2026-11-24T10:00:00Z")).toBe("2026-11-23");
      expect(weekStart("2026-11-29T23:59:59Z")).toBe("2026-11-23");
      expect(weekStart("2026-11-30T00:00:00Z")).toBe("2026-11-30");
    });
  });

  describe("weeklyMetrics", () => {
    it("counts passes, reworks and fallbacks in the week of the ship choice", () => {
      const weeks = weeklyMetrics([
        ...taskLog,
        ship("t2", "2026-11-24T12:00:00Z", 1),
        ship("t3", "2026-11-29T20:00:00Z", null, 3),
        outcome("t1", "2026-11-25T09:00:00Z", "pass"),
        outcome("t2", "2026-11-30T09:00:00Z", "rework"),
      ]);
      expect(weeks).toHaveLength(1);
      const week = weeks[0];
      expect(week).toMatchObject({
        week: "2026-11-23",
        tasks: 3,
        shipped: 2,
        fallbacks: 1,
        passes: 1,
        reworks: 1,
        pending: 0,
        meanAttempts: 2,
        meanWaitSeconds: 300,
      });
      expect(week?.costUsd).toBeCloseTo(0.3, 10);
    });

    it("lets the latest outcome win and counts a shipped task without one as pending", () => {
      const weeks = weeklyMetrics([
        ship("t1", "2026-11-24T10:00:00Z", 1),
        outcome("t1", "2026-11-24T11:00:00Z", "pass"),
        outcome("t1", "2026-11-25T11:00:00Z", "rework"),
        ship("t2", "2026-12-01T10:00:00Z", 1),
      ]);
      expect(weeks.map((week) => [week.week, week.passes, week.reworks, week.pending])).toEqual([
        ["2026-11-23", 0, 1, 0],
        ["2026-11-30", 0, 0, 1],
      ]);
    });

    it("has no weeks for a log without ship choices", () => {
      expect(weeklyMetrics(taskLog.slice(0, 5))).toEqual([]);
    });
  });
});
