import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CostEntry, costTotals, type RunCost, toMinorUnits } from "./cost-totals.ts";

const acmeOps = { id: "workspace-acme-ops", name: "Acme Ops" };
const acmeTeam = { id: "team-acme", name: "Paperclip · Acme" };
const nightlyReport = { id: "nightly-report", name: "Nightly report" };
const weeklyDigest = { id: "weekly-digest", name: "Weekly digest" };
const reviewerAgent = { id: "agent-reviewer", name: "Reviewer" };

const now = new Date("2026-11-25T10:00:00Z");
const timeZone = "Europe/Madrid";

function euros(minorUnits: number): RunCost {
  return { kind: "money", currency: "EUR", minorUnits };
}

function entry(overrides: Partial<CostEntry>): CostEntry {
  return {
    source: acmeOps,
    subject: nightlyReport,
    startedAt: new Date("2026-11-25T08:00:00Z"),
    running: false,
    cost: euros(10),
    ...overrides,
  };
}

verifies("runs.costs", () => {
  describe("costTotals", () => {
    it("totals per source, then per workflow or agent, sorted by name", () => {
      const totals = costTotals({
        entries: [
          entry({ subject: weeklyDigest, cost: euros(5) }),
          entry({ cost: euros(10) }),
          entry({ cost: euros(20) }),
          entry({ source: acmeTeam, subject: reviewerAgent, cost: euros(7) }),
        ],
        period: "today",
        now,
        timeZone,
      });
      expect(totals.sources.map((source) => source.name)).toEqual(["Acme Ops", "Paperclip · Acme"]);
      const [ops] = totals.sources;
      expect(ops?.money).toEqual([{ currency: "EUR", minorUnits: 35 }]);
      expect(ops?.runs).toBe(3);
      expect(ops?.subjects.map((subject) => [subject.name, subject.money])).toEqual([
        ["Nightly report", [{ currency: "EUR", minorUnits: 30 }]],
        ["Weekly digest", [{ currency: "EUR", minorUnits: 5 }]],
      ]);
    });

    it("never adds two currencies together", () => {
      const totals = costTotals({
        entries: [
          entry({ cost: euros(10) }),
          entry({ cost: euros(20) }),
          entry({ cost: { kind: "money", currency: "USD", minorUnits: 5 } }),
        ],
        period: "today",
        now,
        timeZone,
      });
      expect(totals.sources[0]?.money).toEqual([
        { currency: "EUR", minorUnits: 30 },
        { currency: "USD", minorUnits: 5 },
      ]);
    });

    it("counts tokens for subscription agents and no money for them", () => {
      const totals = costTotals({
        entries: [
          entry({
            source: acmeTeam,
            subject: reviewerAgent,
            cost: { kind: "tokens", tokens: 1200 },
          }),
          entry({
            source: acmeTeam,
            subject: reviewerAgent,
            cost: { kind: "tokens", tokens: 800 },
          }),
          entry({ source: acmeTeam, subject: reviewerAgent, cost: { kind: "none" } }),
        ],
        period: "today",
        now,
        timeZone,
      });
      const [team] = totals.sources;
      expect(team?.tokens).toBe(2000);
      expect(team?.money).toEqual([]);
      expect(team?.runs).toBe(3);
    });

    it("marks a total that holds a running run as so far", () => {
      const totals = costTotals({
        entries: [entry({ running: true }), entry({ source: acmeTeam, subject: reviewerAgent })],
        period: "today",
        now,
        timeZone,
      });
      expect(totals.sources.map((source) => [source.name, source.soFar])).toEqual([
        ["Acme Ops", true],
        ["Paperclip · Acme", false],
      ]);
      expect(totals.sources[0]?.subjects[0]?.soFar).toBe(true);
    });

    it("counts a run that crossed midnight in the day it started", () => {
      const crossedMidnight = entry({ startedAt: new Date("2026-11-24T22:50:00Z") });
      const input = { entries: [crossedMidnight], now, timeZone };
      expect(costTotals({ ...input, period: "today" }).sources).toEqual([]);
      expect(costTotals({ ...input, period: "7-days" }).sources[0]?.runs).toBe(1);
    });

    it("leaves out runs before the period and after now", () => {
      const totals = costTotals({
        entries: [
          entry({ startedAt: new Date("2026-10-26T22:59:59Z") }),
          entry({ startedAt: new Date("2026-10-26T23:00:00Z") }),
          entry({ startedAt: new Date("2026-11-25T10:00:01Z") }),
        ],
        period: "30-days",
        now,
        timeZone,
      });
      expect(totals.startsAt.toISOString()).toBe("2026-10-26T23:00:00.000Z");
      expect(totals.sources[0]?.runs).toBe(1);
    });

    it("refuses a money cost that isn't whole minor units", () => {
      expect(() =>
        costTotals({ entries: [entry({ cost: euros(0.11) })], period: "today", now, timeZone }),
      ).toThrow(RangeError);
    });

    it("refuses a token count that isn't a whole, non-negative number", () => {
      for (const tokens of [1.5, -3, Number.NaN]) {
        const cost = { kind: "tokens", tokens } as const;
        expect(() =>
          costTotals({ entries: [entry({ cost })], period: "today", now, timeZone }),
        ).toThrow(RangeError);
      }
    });
  });

  describe("toMinorUnits", () => {
    it("uses the currency's own decimals and rounds exactly", () => {
      expect(toMinorUnits(0.11, "EUR")).toBe(11);
      expect(toMinorUnits(0.285, "USD")).toBe(29);
      expect(toMinorUnits(150, "JPY")).toBe(150);
      expect(toMinorUnits(1e-7, "EUR")).toBe(0);
    });
  });
});
