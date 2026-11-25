import { describe, expect, it } from "vitest";
import {
  calendarDay,
  clockTime,
  decidedAt,
  endedAgo,
  isLate,
  movesOnLine,
  movesOnMeta,
  waitingFor,
  waitingSince,
} from "./waiting-time.ts";

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026, 10:00.
const asked = new Date(2026, 10, 8, 10, 0);
const at = (day: number, hours: number, minutes: number) => new Date(2026, 10, day, hours, minutes);

// The Inbox's requirement `inbox.waiting-time` holds the full cases; these keep the kit's copy honest.
describe("waiting time", () => {
  it("says since when and how long, 24-hour", () => {
    expect(waitingSince(asked, at(8, 13, 0))).toBe("Waiting since 10:00 (3 h)");
    expect(waitingFor(asked, at(8, 13, 0))).toBe("Waiting 3 h");
    expect(endedAgo("Finished", asked, at(8, 10, 5))).toBe("Finished 5 min ago");
  });

  it("names the day once it isn't today", () => {
    expect(clockTime(asked, at(10, 9, 0))).toBe("Sun 10:00");
    expect(clockTime(asked, at(20, 9, 0))).toBe("Sun 8 Nov, 10:00");
    expect(isLate(asked, at(9, 10, 0))).toBe(true);
  });

  it("says when a wait moves on and when a decision was made", () => {
    expect(movesOnLine(at(9, 14, 0))).toBe("Moves on by itself on Mon 9 Nov, 14:00.");
    expect(movesOnMeta(at(9, 14, 0))).toBe("moves on Mon 14:00");
    expect(decidedAt(at(8, 10, 44))).toBe("10:44");
    expect(calendarDay(at(24, 18, 43))).toBe("24 Nov");
  });
});
