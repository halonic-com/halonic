import { describe, expect, it } from "vitest";
import { nextWhen } from "./list-words.ts";

// Wednesday 18 November 2026, 10:00 local time.
const now = new Date(2026, 10, 18, 10, 0);
const at = (month: number, day: number, hour: number, minute: number, year = 2026) =>
  new Date(year, month, day, hour, minute).toISOString();

describe("nextWhen", () => {
  it("says today and tomorrow in words", () => {
    expect(nextWhen(at(10, 18, 17, 5), now)).toBe("next today 17:05");
    expect(nextWhen(at(10, 19, 7, 30), now)).toBe("next tomorrow 07:30");
  });

  it("gives the weekday within the week", () => {
    expect(nextWhen(at(10, 23, 7, 30), now)).toBe("next Mon 07:30");
  });

  it("gives the date from a week on, and the year when it is another year's", () => {
    expect(nextWhen(at(10, 27, 9, 0), now)).toBe("next Fri 27 Nov 09:00");
    expect(nextWhen(at(0, 4, 9, 0, 2027), now)).toBe("next Mon 4 Jan 2027 09:00");
  });
});
