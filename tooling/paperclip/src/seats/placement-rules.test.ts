import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  defaultPlacementRules,
  proposePlacements,
  type SeatNow,
  type WindowNow,
} from "./placement-rules.ts";

const now = "2026-11-22T10:00:00.000Z";

function window(usedPercent: number, resetsAt: string, percentPerHour?: number): WindowNow {
  return { usedPercent, percentPerHour, resetsAt };
}

function seat(id: string, overrides: Partial<SeatNow> = {}): SeatNow {
  return {
    id,
    role: "pool",
    status: "active",
    resetGroup: undefined,
    manualResetUsed: false,
    readable: true,
    session: window(20, "2026-11-22T13:00:00.000Z"),
    week: window(40, "2026-11-26T08:00:00.000Z"),
    ...overrides,
  };
}

function on(...pairs: [string, string][]): Map<string, string> {
  return new Map(pairs);
}

verifies("paperclip.seats-placement-rules", () => {
  test("an agent leaves a seat at 80% of its 5-hour window", () => {
    const seats = [
      seat("seat-a", { session: window(82, "2026-11-22T12:00:00.000Z") }),
      seat("seat-b"),
    ];

    expect(proposePlacements(seats, on(["agent-1", "seat-a"]), now).moves).toEqual([
      { agentId: "agent-1", from: "seat-a", to: "seat-b", reason: "session-full" },
    ]);
  });

  test("a session projected above 90% within the hour moves its agents", () => {
    const rising = seat("seat-a", { session: window(70, "2026-11-22T12:00:00.000Z", 30) });

    const { moves } = proposePlacements([rising, seat("seat-b")], on(["agent-1", "seat-a"]), now);
    expect(moves.map((move) => move.reason)).toEqual(["session-projected"]);
  });

  test("a session that resets before it would pass 90% keeps its agents", () => {
    const resetting = seat("seat-a", { session: window(70, "2026-11-22T10:10:00.000Z", 30) });

    expect(
      proposePlacements([resetting, seat("seat-b")], on(["agent-1", "seat-a"]), now).moves,
    ).toEqual([]);
  });

  test("an agent leaves a seat at 88% of its week", () => {
    const full = seat("seat-a", { week: window(88, "2026-11-25T08:00:00.000Z") });

    const { moves } = proposePlacements([full, seat("seat-b")], on(["agent-1", "seat-a"]), now);
    expect(moves).toEqual([
      { agentId: "agent-1", from: "seat-a", to: "seat-b", reason: "week-full" },
    ]);
  });

  test("the pool seat whose week resets soonest comes first, a reserve only after the pool", () => {
    const full = seat("seat-a", { session: window(85, "2026-11-22T12:00:00.000Z") });
    const friday = seat("seat-b", { week: window(10, "2026-11-27T08:00:00.000Z") });
    const tuesday = seat("seat-c", { week: window(60, "2026-11-24T08:00:00.000Z") });
    const reserve = seat("seat-r", {
      role: "reserve",
      week: window(0, "2026-11-23T08:00:00.000Z"),
    });
    const seats = [full, friday, tuesday, reserve];

    expect(proposePlacements(seats, on(["agent-1", "seat-a"]), now).moves[0]?.to).toBe("seat-c");

    const poolFull = seats.map((each) =>
      each.role === "pool" && each.id !== "seat-a"
        ? { ...each, week: window(90, "2026-11-24T08:00:00.000Z") }
        : each,
    );
    expect(proposePlacements(poolFull, on(["agent-1", "seat-a"]), now).moves[0]?.to).toBe("seat-r");
  });

  test("agents leave the paid-API seat and are never sent there", () => {
    const paid = seat("seat-p", {
      role: "paid-api",
      session: window(0, now),
      week: window(0, now),
    });
    const full = seat("seat-a", { session: window(95, "2026-11-22T12:00:00.000Z") });

    const { moves } = proposePlacements(
      [paid, full],
      on(["agent-1", "seat-p"], ["agent-2", "seat-a"]),
      now,
    );
    expect(moves).toEqual([
      { agentId: "agent-1", from: "seat-p", to: undefined, reason: "paid-api" },
      { agentId: "agent-2", from: "seat-a", to: undefined, reason: "session-full" },
    ]);
  });

  test("a seat whose reading can't be trusted is left alone", () => {
    const unread = seat("seat-a", {
      readable: false,
      session: window(99, "2026-11-22T12:00:00.000Z"),
    });
    const unreadFree = seat("seat-b", { readable: false });
    const full = seat("seat-c", { session: window(90, "2026-11-22T12:00:00.000Z") });

    const { moves } = proposePlacements(
      [unread, unreadFree, full],
      on(["agent-1", "seat-a"], ["agent-2", "seat-c"]),
      now,
    );
    expect(moves).toEqual([
      { agentId: "agent-2", from: "seat-c", to: undefined, reason: "session-full" },
    ]);
  });

  test("a paused seat takes no agents", () => {
    const full = seat("seat-a", { session: window(90, "2026-11-22T12:00:00.000Z") });
    const paused = seat("seat-b", { status: "paused" });

    expect(
      proposePlacements([full, paused], on(["agent-1", "seat-a"]), now).moves[0]?.to,
    ).toBeUndefined();
  });

  test("the limit of agents per seat spreads the moves", () => {
    const full = seat("seat-a", { session: window(90, "2026-11-22T12:00:00.000Z") });
    const soon = seat("seat-b", { week: window(10, "2026-11-24T08:00:00.000Z") });
    const later = seat("seat-c", { week: window(10, "2026-11-25T08:00:00.000Z") });
    const rules = { ...defaultPlacementRules, agentsPerSeat: 2 };

    const { moves } = proposePlacements(
      [full, soon, later],
      on(["agent-1", "seat-a"], ["agent-2", "seat-a"], ["agent-3", "seat-b"]),
      now,
      rules,
    );
    expect(moves.map((move) => [move.agentId, move.to])).toEqual([
      ["agent-1", "seat-b"],
      ["agent-2", "seat-c"],
    ]);
  });

  test("a full seat with its reset unused and its week far off gets reset advice, one per group", () => {
    const fourDays = "2026-11-26T10:00:00.000Z";
    const seats = [
      seat("seat-a", { resetGroup: "group-1", week: window(95, fourDays) }),
      seat("seat-b", { resetGroup: "group-1", week: window(96, fourDays) }),
      seat("seat-c", { resetGroup: "group-2", manualResetUsed: true, week: window(95, fourDays) }),
      seat("seat-d", { resetGroup: "group-3", week: window(95, "2026-11-24T10:00:00.000Z") }),
      seat("seat-e", { week: window(95, fourDays) }),
    ];

    expect(proposePlacements(seats, on(), now).resetAdvice).toEqual(["seat-a"]);
  });
});
