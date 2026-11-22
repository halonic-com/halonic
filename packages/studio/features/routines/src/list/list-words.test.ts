import { describe, expect, it } from "vitest";
import { nextWhen, refusedWhen } from "./list-words.ts";

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

describe("refusedWhen", () => {
  it("says the refused time today, yesterday, this week and then with its date and another year", () => {
    expect(refusedWhen(at(10, 18, 9, 41), now)).toBe("couldn't start today 09:41");
    expect(refusedWhen(at(10, 17, 19, 41), now)).toBe("couldn't start yesterday 19:41");
    expect(refusedWhen(at(10, 14, 7, 30), now)).toBe("couldn't start Sat 07:30");
    expect(refusedWhen(at(10, 6, 7, 30), now)).toBe("couldn't start Fri 6 Nov 07:30");
    expect(refusedWhen(at(11, 30, 7, 30, 2025), now)).toBe("couldn't start Tue 30 Dec 2025 07:30");
  });
});
