import type { TeamRun, TeamRuns, WorkItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { earlierToday, endedJustNow, nextFor } from "./activity-today.ts";

const chief = "acme:agent:chief";

function run(id: string, startedAt: string, fields: Partial<TeamRun> = {}): TeamRun {
  return {
    id,
    source: "acme",
    agent: chief,
    task: { id: `acme:task:${id}`, identifier: `ACME-${id}`, title: "Review the page" },
    state: "succeeded",
    startedAt,
    finishedAt: new Date(Date.parse(startedAt) + 9 * 60_000).toISOString(),
    canStop: false,
    ...fields,
  };
}

function runsOf(...runs: TeamRun[]): TeamRuns[] {
  return [{ source: "acme", asOf: "2026-11-26T14:00:00Z", runs, complete: true }];
}

function work(id: string, fields: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    source: "acme",
    label: `ACME-${id}`,
    title: `Task ${id}`,
    state: "todo",
    assignee: chief,
    blockedBy: [],
    updatedAt: `2026-11-26T1${id}:00:00Z`,
    ...fields,
  };
}

verifies("messenger.activity-idle", () => {
  describe("earlierToday", () => {
    it("lists up to 3 of the agent's earlier runs, newest first, without the one shown", () => {
      const runs = runsOf(
        run("1", "2026-11-26T08:15:00Z", { state: "cancelled" }),
        run("2", "2026-11-26T09:47:00Z"),
        run("3", "2026-11-26T11:02:00Z"),
        run("4", "2026-11-26T12:00:00Z"),
        run("5", "2026-11-26T13:29:00Z"),
        run("6", "2026-11-26T13:30:00Z", { agent: "acme:agent:liam" }),
      );
      const earlier = earlierToday(chief, runs, "5");
      expect(earlier.map((each) => each.id)).toEqual(["4", "3", "2"]);
      expect(earlier[0]).toMatchObject({
        outcome: "done",
        task: "ACME-4 Review the page",
        minutes: 9,
      });
    });

    it("leaves out a run that never started or hasn't ended", () => {
      const live = run("1", "2026-11-26T08:15:00Z", { state: "running" });
      delete live.finishedAt;
      expect(earlierToday(chief, runsOf(live), undefined)).toEqual([]);
    });
  });

  describe("nextFor", () => {
    it("lists up to 3 open tasks the agent holds, newest first, without the run's own", () => {
      const items = [
        work("1"),
        work("2", { state: "done" }),
        work("3", { assignee: "acme:agent:liam" }),
        work("4", { state: "in-progress" }),
        work("5"),
        work("6"),
        work("7"),
      ];
      expect(nextFor(chief, items, "7").map((each) => each.label)).toEqual([
        "ACME-6",
        "ACME-5",
        "ACME-4",
      ]);
    });
  });

  describe("endedJustNow", () => {
    it("is true for 10 minutes after the run ended", () => {
      const ended = new Date("2026-11-26T14:00:00Z");
      expect(endedJustNow(ended, new Date("2026-11-26T14:09:00Z"))).toBe(true);
      expect(endedJustNow(ended, new Date("2026-11-26T14:10:00Z"))).toBe(false);
    });
  });
});
