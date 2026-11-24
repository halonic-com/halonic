import type { Seat, SeatWindow } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { seatProblems } from "./seat-problems.ts";

const now = new Date("2026-11-24T13:00:00.000Z");

/** A pool seat read just now, with its week window at `usedPercent`. */
function seat(label: string, week: Partial<SeatWindow> = {}, changes: Partial<Seat> = {}): Seat {
  return {
    id: label,
    source: "acme",
    label,
    role: "pool",
    state: "ok",
    windows: [{ kind: "week", label: "This week", usedPercent: 20, ...week }],
    agents: [],
    manualReset: "none",
    asOf: now.toISOString(),
    ...changes,
  };
}

const kinds = (seats: Seat[]) =>
  seatProblems(seats, now).map((problem) => [problem.seat.label, problem.kind, problem.quiet]);

verifies("team.seat-problems", () => {
  describe("seatProblems", () => {
    it("gives a seat at 80% of its week a quiet problem", () => {
      expect(kinds([seat("Seat A", { usedPercent: 80 })])).toEqual([["Seat A", "at-80", true]]);
    });

    it("gives a seat at 90% of its week a problem that isn't quiet", () => {
      expect(kinds([seat("Seat A", { usedPercent: 91 })])).toEqual([["Seat A", "at-90", false]]);
    });

    it("gives a seat whose forecast reaches 90% within an hour a problem", () => {
      const soon = seat("Seat B", { usedPercent: 84, reaches90At: "2026-11-24T13:40:00.000Z" });
      const later = seat("Seat C", { usedPercent: 70, reaches90At: "2026-11-24T14:30:00.000Z" });
      expect(kinds([soon, later])).toEqual([["Seat B", "reaches-90-soon", false]]);
    });

    it("gives a seat not read for 30 minutes a problem, whatever its last reading", () => {
      const old = seat("Seat A", {}, { asOf: "2026-11-24T12:30:00.000Z" });
      const recent = seat("Seat B", {}, { asOf: "2026-11-24T12:31:00.000Z" });
      expect(kinds([old, recent])).toEqual([["Seat A", "not-read", false]]);
    });

    it("gives no problem to a seat under 80% read just now", () => {
      expect(kinds([seat("Seat A", { usedPercent: 79 })])).toEqual([]);
    });

    it("lists problems worst first", () => {
      const seats = [
        seat("At 80", { usedPercent: 82 }),
        seat("Signed out", {}, { state: "signed-out" }),
        seat("At 90", { usedPercent: 95 }),
        seat("Full", { usedPercent: 100 }, { state: "full" }),
      ];
      expect(kinds(seats).map(([label]) => label)).toEqual([
        "Full",
        "Signed out",
        "At 90",
        "At 80",
      ]);
    });
  });
});
