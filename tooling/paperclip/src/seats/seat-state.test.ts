import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { SeatReading, WindowState } from "./records.ts";
import { type SeatSettingNow, seatStates } from "./seat-state.ts";

const now = "2026-11-22T12:00:00.000Z";
const sessionReset = "2026-11-22T14:00:00.000Z";
const weekReset = "2026-11-26T08:00:00.000Z";

const seatA: SeatSettingNow = { id: "seat-a", role: "pool", resetGroup: "group-g" };
const seatB: SeatSettingNow = { id: "seat-b", role: "reserve", resetGroup: "group-g" };
const seatC: SeatSettingNow = { id: "seat-c", role: "pool", resetGroup: undefined };

function window(usedPercent: number, resetsAt: string): WindowState {
  return { usedPercent, resetsAt };
}

function reading(
  seatId: string,
  at: string,
  session: number,
  week: number,
  error?: SeatReading["error"],
): SeatReading {
  return {
    seatId,
    at,
    error,
    session: error === undefined ? window(session, sessionReset) : undefined,
    week: error === undefined ? window(week, weekReset) : undefined,
    weekByModel: {},
  };
}

verifies("paperclip.seats-check-state", () => {
  test("a window's percent and rate come from the recent good readings", () => {
    const [state] = seatStates(
      [seatA],
      [
        reading("seat-a", "2026-11-22T10:55:00.000Z", 40, 50),
        reading("seat-a", "2026-11-22T11:55:00.000Z", 60, 52),
      ],
      [],
      now,
    );
    expect(state?.readable).toBe(true);
    expect(state?.session).toEqual({ usedPercent: 60, percentPerHour: 20, resetsAt: sessionReset });
    expect(state?.week?.usedPercent).toBe(52);
  });

  test("a failed newest read leaves the seat unreadable but keeps its last good windows", () => {
    const [state] = seatStates(
      [seatA],
      [
        reading("seat-a", "2026-11-22T11:45:00.000Z", 30, 50),
        reading("seat-a", "2026-11-22T11:55:00.000Z", 0, 0, "rate-limited"),
      ],
      [],
      now,
    );
    expect(state?.readable).toBe(false);
    expect(state?.session?.usedPercent).toBe(30);
  });

  test("a newest good reading over 30 minutes old leaves the seat unreadable", () => {
    const [stale] = seatStates(
      [seatA],
      [reading("seat-a", "2026-11-22T11:20:00.000Z", 30, 50)],
      [],
      now,
    );
    const [fresh] = seatStates(
      [seatA],
      [reading("seat-a", "2026-11-22T11:30:00.000Z", 30, 50)],
      [],
      now,
    );
    expect(stale?.readable).toBe(false);
    expect(fresh?.readable).toBe(true);
  });

  test("a seat never read is unreadable and has no windows", () => {
    const [state] = seatStates(
      [seatC],
      [reading("seat-a", "2026-11-22T11:55:00.000Z", 30, 50)],
      [],
      now,
    );
    expect(state).toMatchObject({
      id: "seat-c",
      readable: false,
      session: undefined,
      week: undefined,
    });
  });

  test("a manual reset on one seat uses up its whole reset group's reset", () => {
    const states = seatStates(
      [seatA, seatB, seatC],
      [],
      [{ seatId: "seat-a", kind: "manual-reset", at: "2026-11-20T09:00:00.000Z", by: "board" }],
      now,
    );
    expect(states.map((state) => state.manualResetUsed)).toEqual([true, true, false]);
  });

  test("other events and resets for seats outside the settings don't count", () => {
    const states = seatStates(
      [seatA, seatC],
      [],
      [
        { seatId: "seat-a", kind: "weekly-reset", at: "2026-11-20T09:00:00.000Z", by: "observed" },
        { seatId: "seat-z", kind: "manual-reset", at: "2026-11-20T09:00:00.000Z", by: "board" },
      ],
      now,
    );
    expect(states.map((state) => state.manualResetUsed)).toEqual([false, false]);
  });

  test("a week whose reset has passed counts as unused again", () => {
    const passed: SeatReading = {
      ...reading("seat-a", "2026-11-22T11:55:00.000Z", 30, 95),
      week: window(95, "2026-11-22T11:58:00.000Z"),
    };
    const [state] = seatStates([seatA], [passed], [], now);
    expect(state?.week).toEqual({ usedPercent: 0, percentPerHour: undefined, resetsAt: undefined });
  });

  test("seats keep the settings' order and roles, and are active", () => {
    const states = seatStates([seatC, seatA], [], [], now);
    expect(states.map((state) => [state.id, state.role, state.status])).toEqual([
      ["seat-c", "pool", "active"],
      ["seat-a", "pool", "active"],
    ]);
  });
});
