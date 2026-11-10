import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  decidedAt,
  isLate,
  movesOnLine,
  movesOnMeta,
  waitingFor,
  waitingSince,
} from "./waiting-time.ts";

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026, 10:42.
const asked = new Date(2026, 10, 8, 10, 42);
const at = (day: number, hours: number, minutes: number) => new Date(2026, 10, day, hours, minutes);

verifies("inbox.waiting-time", () => {
  it("says a minute for a fresh item", () => {
    expect(waitingFor(asked, at(8, 10, 43))).toBe("Waiting 1 min");
    expect(waitingFor(asked, new Date(asked.getTime() + 5_000))).toBe("Waiting 1 min");
    expect(waitingSince(asked, at(8, 10, 43))).toBe("Waiting since 10:42 (1 min)");
    expect(isLate(asked, at(8, 10, 43))).toBe(false);
  });

  it("gives hours in the row, and hours and minutes on the card", () => {
    const now = at(8, 17, 22);
    expect(waitingFor(asked, now)).toBe("Waiting 6 h");
    expect(waitingSince(asked, now)).toBe("Waiting since 10:42 (6 h 40 min)");
    expect(waitingSince(asked, at(8, 16, 42))).toBe("Waiting since 10:42 (6 h)");
  });

  it("gives days, the weekday and late from 24 hours on", () => {
    const now = at(10, 11, 0);
    expect(waitingFor(asked, now)).toBe("Waiting 2 days");
    expect(waitingFor(asked, at(9, 10, 42))).toBe("Waiting 1 day");
    expect(waitingSince(asked, now)).toBe("Waiting since Sun 10:42 (2 days)");
    expect(isLate(asked, at(9, 10, 41))).toBe(false);
    expect(isLate(asked, at(9, 10, 42))).toBe(true);
  });

  it("gives the date from 6 days on", () => {
    expect(waitingSince(new Date(2026, 9, 31, 10, 42), at(8, 11, 0))).toBe(
      "Waiting since Sat 31 Oct, 10:42 (8 days)",
    );
  });

  it("writes a wait step's timer and a decision's time", () => {
    expect(movesOnLine(at(9, 14, 0))).toBe("Moves on by itself on Mon 9 Nov, 14:00.");
    expect(movesOnMeta(at(9, 14, 0))).toBe("moves on Mon 14:00");
    expect(decidedAt(at(8, 10, 44))).toBe("10:44");
  });
});
