import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { SeatReading } from "../records.ts";
import { windowReadings } from "./types.ts";

const at = "2026-11-20T10:00:00.000Z";

verifies("paperclip.seats-window-readings", () => {
  test("a reading gives one window reading per window it holds", () => {
    const reading: SeatReading = {
      seatId: "seat-a",
      at,
      error: undefined,
      session: { usedPercent: 12, resetsAt: "2026-11-20T13:00:00.000Z" },
      week: { usedPercent: 40, resetsAt: "2026-11-24T08:00:00.000Z" },
      weekByModel: { "Sonnet only": { usedPercent: 5, resetsAt: undefined } },
    };
    expect(windowReadings([reading])).toEqual([
      {
        seatId: "seat-a",
        window: "session",
        at,
        usedPercent: 12,
        resetsAt: "2026-11-20T13:00:00.000Z",
      },
      {
        seatId: "seat-a",
        window: "week",
        at,
        usedPercent: 40,
        resetsAt: "2026-11-24T08:00:00.000Z",
      },
      { seatId: "seat-a", window: "week:Sonnet only", at, usedPercent: 5, resetsAt: undefined },
    ]);
  });

  test("a failed read gives no window readings", () => {
    const failed: SeatReading = {
      seatId: "seat-b",
      at,
      error: "timeout",
      session: undefined,
      week: undefined,
      weekByModel: {},
    };
    expect(windowReadings([failed])).toEqual([]);
  });
});
