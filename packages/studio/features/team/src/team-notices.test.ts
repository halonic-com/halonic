import type { MergeQueue, Seat, SeatWindow } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { TeamClock } from "./team-format.ts";
import { type TeamReading, teamAlerts, teamNotices } from "./team-notices.ts";

const clock: TeamClock = { now: () => new Date("2026-11-24T13:00:00.000Z"), timeZone: "UTC" };
const resetsAt = "2026-11-26T09:00:00.000Z";

/** Seat B, read just now, with 4 agents and its week window at `usedPercent`. */
function seatB(week: Partial<SeatWindow> = {}, changes: Partial<Seat> = {}): Seat {
  return {
    id: "seat-b",
    source: "acme",
    label: "Seat B",
    role: "pool",
    state: "ok",
    windows: [{ kind: "week", label: "This week", usedPercent: 20, resetsAt, ...week }],
    agents: ["owen", "kim", "nina", "sam"],
    manualReset: "none",
    asOf: clock.now().toISOString(),
    ...changes,
  };
}

function queue(changes: Partial<MergeQueue> = {}): MergeQueue {
  return {
    source: "acme",
    repo: "halonic",
    health: "running",
    groups: [
      {
        position: 1,
        state: "building",
        since: "2026-11-24T12:50:00.000Z",
        pullRequests: ["a", "b"],
      },
    ],
    waiting: ["c", "d", "e", "f", "g"],
    removedToday: [],
    asOf: clock.now().toISOString(),
    ...changes,
  };
}

const reading = (seats: Seat[], queues: MergeQueue[] = []): TeamReading => ({ seats, queues });
const alerts = (before: TeamReading, after: TeamReading) =>
  teamAlerts(before, after, clock).map((alert) => [alert.title, alert.body]);

verifies("team.notices", () => {
  describe("teamNotices", () => {
    it("gives a seat at 80% a quiet notice in S19's words", () => {
      expect(teamNotices([seatB({ usedPercent: 80 })], clock)).toEqual([
        {
          id: "seat-b",
          kind: "at-80",
          title: "Seat B has used 80% of its week",
          line: "Resets Thu 09:00",
          quiet: true,
        },
      ]);
    });

    it("updates the same notice in place at 90%, and it is no longer quiet", () => {
      const [notice] = teamNotices([seatB({ usedPercent: 90 })], clock);
      expect(notice).toMatchObject({
        id: "seat-b",
        title: "Seat B has used 90% of its week",
        quiet: false,
      });
    });

    it("leaves once the seat is under 80%", () => {
      expect(teamNotices([seatB({ usedPercent: 79 })], clock)).toEqual([]);
    });

    it("words the other seat notices as S19 does", () => {
      const lines = (seat: Seat) =>
        teamNotices([seat], clock).map((each) => [each.title, each.line]);
      const two = { agents: ["kim", "nina"] };
      expect(lines(seatB({ usedPercent: 84, reaches90At: "2026-11-24T13:40:00.000Z" }))).toEqual([
        ["Seat B reaches 90% around 13:40", "4 agents on it"],
      ]);
      expect(lines(seatB({ usedPercent: 100 }, { state: "full", ...two }))).toEqual([
        ["Seat B is full until Thu 09:00", "2 agents still on it"],
      ]);
      const signedOut = {
        state: "signed-out" as const,
        label: "Seat D",
        asOf: "2026-11-24T09:40:00.000Z",
      };
      expect(lines(seatB({}, { ...signedOut, ...two }))).toEqual([
        ["Seat D is signed out", "Since 09:40 · 2 agents on it"],
      ]);
    });
  });
});

verifies("team.notifications", () => {
  describe("teamAlerts", () => {
    it("notifies when a seat goes into 90%, full or signed out, in S20's words", () => {
      const before = reading([seatB({ usedPercent: 84 })]);
      expect(
        alerts(
          before,
          reading([seatB({ usedPercent: 84, reaches90At: "2026-11-24T13:40:00.000Z" })]),
        ),
      ).toEqual([["Seat B reaches 90% around 13:40", "4 agents on it · resets Thu 09:00"]]);
      expect(
        alerts(
          before,
          reading([seatB({ usedPercent: 100 }, { state: "full", agents: ["kim", "nina"] })]),
        ),
      ).toEqual([["Seat B is full until Thu 09:00", "2 agents still on it"]]);
      const signedOut = seatB(
        {},
        { state: "signed-out", label: "Seat D", asOf: "2026-11-24T09:40:00.000Z" },
      );
      expect(alerts(before, reading([{ ...signedOut, agents: ["kim", "nina"] }]))).toEqual([
        ["Seat D is signed out", "Since 09:40 · 2 agents on it"],
      ]);
    });

    it("notifies once per change: the same problem on the next read shows nothing", () => {
      const full = reading([seatB({ usedPercent: 100 }, { state: "full" })]);
      expect(alerts(full, full)).toEqual([]);
      const soon = reading([seatB({ usedPercent: 86, reaches90At: "2026-11-24T13:20:00.000Z" })]);
      expect(alerts(soon, reading([seatB({ usedPercent: 91 })]))).toEqual([]);
    });

    it("doesn't notify for a seat that only goes into 80%", () => {
      expect(alerts(reading([seatB()]), reading([seatB({ usedPercent: 82 })]))).toEqual([]);
    });

    it("notifies when the merge queue's runners have been busy for 5 minutes", () => {
      const busy = (minutes: number) =>
        reading([], [queue({ health: "runners-busy", runnerWaitMinutes: minutes })]);
      expect(alerts(reading([], [queue()]), busy(4))).toEqual([]);
      expect(alerts(busy(4), busy(12))).toEqual([
        ["Runners busy · pushes are on hold", "Longest wait 12 min · 7 PRs in the queue"],
      ]);
      expect(alerts(busy(12), busy(14))).toEqual([]);
    });
  });
});
