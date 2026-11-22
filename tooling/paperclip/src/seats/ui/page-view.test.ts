import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { SeatRow, SeatsPage, WindowRow } from "../plugin/seats-page.ts";
import {
  cardsView,
  movesView,
  refillCalendar,
  resettableSeats,
  seatRowsView,
  stateView,
  untilText,
  windowText,
} from "./page-view.ts";

// Made-up seats and agents only.
const at = "2026-11-22T11:20:00.000Z";

function seat(overrides: Partial<SeatRow> = {}): SeatRow {
  return {
    seatId: "seat-a",
    role: "pool",
    resetGroup: undefined,
    manualResetUsed: false,
    readable: true,
    lastError: undefined,
    readingAgeMinutes: 3,
    nextReadAt: "2026-11-22T11:27:00.000Z",
    signInExpiresAt: "2026-11-27T11:20:00.000Z",
    alerts: [],
    session: undefined,
    week: undefined,
    agents: [],
    ...overrides,
  };
}

function page(overrides: Partial<SeatsPage> = {}): SeatsPage {
  return {
    at,
    readerStartedAt: "2026-11-22T09:00:00.000Z",
    movesEnabled: false,
    cards: {
      poolPointsLeft: 100,
      poolSeatsUnreadable: 1,
      poolPointsPerHour: 1.24,
      nextRefill: { seatId: "seat-a", at: "2026-11-25T16:20:00.000Z", points: 35 },
    },
    seats: [seat()],
    refills: [{ seatId: "seat-a", at: "2026-11-25T16:20:00.000Z", points: 35 }],
    proposal: { moves: [], resetAdvice: [] },
    forecast: undefined,
    ...overrides,
  };
}

const rising: WindowRow = {
  usedPercent: 70,
  percentPerHour: 20,
  resetsAt: "2026-11-22T13:20:00.000Z",
  reaches80At: "2026-11-22T11:50:00.000Z",
  reaches90At: "2026-11-22T12:20:00.000Z",
};

verifies("paperclip.seats-page-view", () => {
  test("the cards give points left with the unreadable seats, the rate and the next refill", () => {
    expect(cardsView(page())).toEqual([
      { label: "Pool points left this week (1 seat can't be read)", value: 100 },
      { label: "Run-out time (P50 to P90)", value: "Comes with the seat forecast" },
      { label: "Pool use now, points per hour", value: 1.2 },
      { label: "Next refill", value: "seat-a, 35 points, in 3 d 5 h" },
    ]);
    const quiet = page({
      cards: {
        poolPointsLeft: 0,
        poolSeatsUnreadable: 0,
        poolPointsPerHour: undefined,
        nextRefill: undefined,
      },
    });
    expect(cardsView(quiet).map((card) => card.value)).toEqual([
      0,
      "Comes with the seat forecast",
      "No rate yet",
      "None in the next 7 days",
    ]);
  });

  test("a window says when it reaches 80% and 90% and when it resets", () => {
    expect(windowText(rising, at)).toBe("70% used, 80% in 30 min, 90% in 1 h, resets in 2 h");
    const past = { ...rising, usedPercent: 85, reaches80At: at, reaches90At: undefined };
    expect(windowText(past, at)).toBe("85% used, past 80%, resets in 2 h");
    expect(windowText(undefined, at)).toBe("No reading");
  });

  test("a seat row gives its agents, reading age and sign-in expiry", () => {
    const row = seatRowsView(
      page({
        seats: [
          seat({
            resetGroup: "g1",
            session: rising,
            agents: [
              { agentId: "agent-1", name: "Ann" },
              { agentId: "agent-2", name: "Bo" },
            ],
          }),
        ],
      }),
    );
    expect(row).toEqual([
      {
        id: "seat-a",
        seat: "seat-a (pool, group g1)",
        state: { status: "ok", label: "OK" },
        fiveHour: "70% used, 80% in 30 min, 90% in 1 h, resets in 2 h",
        week: "No reading",
        agents: "Ann, Bo",
        reading: "Read 3 min ago, next in 7 min",
        signIn: "Expires in 5 d",
      },
    ]);
  });

  test("a failed reading shows as an error, alerts as a warning", () => {
    expect(stateView(seat({ readable: false, lastError: "rate-limited" }))).toEqual({
      status: "error",
      label: "Rate-limited",
    });
    expect(stateView(seat({ readable: false }))).toEqual({
      status: "error",
      label: "No recent reading",
    });
    expect(stateView(seat({ alerts: ["sign-in-expiring", "readings-stopped"] }))).toEqual({
      status: "warning",
      label: "sign-in expires within a day, readings stopped",
    });
  });

  test("the 7-day calendar puts each refill in its hour", () => {
    const calendar = refillCalendar(page());
    expect(calendar).toHaveLength(168);
    expect(calendar[0]?.timestamp).toBe("2026-11-22T11:00:00.000Z");
    expect(calendar.filter((hour) => hour.value > 0)).toEqual([
      { timestamp: "2026-11-25T16:00:00.000Z", value: 35 },
    ]);
  });

  test("a move gives its reason in numbers, and says when no seat can take the agent", () => {
    const full = {
      usedPercent: 90,
      percentPerHour: undefined,
      resetsAt: undefined,
      reaches80At: at,
      reaches90At: at,
    };
    const moves = movesView(
      page({
        seats: [seat({ week: full })],
        proposal: {
          moves: [
            {
              agent: { agentId: "agent-1", name: "Ann" },
              from: "seat-a",
              to: undefined,
              reason: "week-full",
            },
          ],
          resetAdvice: [],
        },
      }),
    );
    expect(moves).toEqual([
      {
        id: "agent-1:seat-a",
        agent: "Ann",
        from: "seat-a",
        to: "No seat can take it now",
        why: "week at 90%",
      },
    ]);
  });

  test("only seats whose reset group has no manual reset can record one", () => {
    const seats = [seat(), seat({ seatId: "seat-b", manualResetUsed: true })];
    expect(resettableSeats(page({ seats }))).toEqual(["seat-a"]);
  });

  test("times read as minutes, hours or days, and now once passed", () => {
    expect(untilText(at, "2026-11-22T11:20:00.000Z")).toBe("now");
    expect(untilText(at, "2026-11-22T13:20:00.000Z")).toBe("in 2 h");
    expect(untilText(at, "2026-11-24T11:20:00.000Z")).toBe("in 2 d");
  });
});
