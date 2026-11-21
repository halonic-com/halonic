import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  agentsAsOfText,
  asOfText,
  dayOf,
  secondsText,
  spelled,
  spoken,
  timeOf,
  triesLeftText,
} from "./phone-forms.ts";

// Local times, so the forms read the same in any time zone.
const now = new Date(2026, 10, 21, 18, 30);

verifies("remote.phone-forms", () => {
  it("writes times in 24 hours and days with the year only when it isn't this year's", () => {
    expect(timeOf(new Date(2026, 10, 21, 9, 5))).toBe("09:05");
    expect(dayOf(new Date(2026, 10, 14), now)).toBe("14 Nov");
    expect(dayOf(new Date(2025, 10, 3), now)).toBe("3 Nov 2025");
  });

  it("writes as of a time today, yesterday, or on an earlier day", () => {
    expect(asOfText(new Date(2026, 10, 21, 14, 2), now)).toBe("14:02");
    expect(asOfText(new Date(2026, 10, 20, 14, 2), now)).toBe("yesterday 14:02");
    expect(asOfText(new Date(2026, 10, 14, 14, 2), now)).toBe("14 Nov 14:02");
    expect(asOfText(new Date(2025, 11, 31, 23, 59), new Date(2026, 0, 2, 8, 0))).toBe(
      "31 Dec 2025 23:59",
    );
    // The day before the 1st of a month is the month before's last day.
    expect(asOfText(new Date(2026, 9, 31, 8, 0), new Date(2026, 10, 1, 8, 0))).toBe(
      "yesterday 08:00",
    );
  });

  it("writes tries left", () => {
    expect(triesLeftText(4)).toBe("4 tries left");
    expect(triesLeftText(2)).toBe("2 tries left");
    expect(triesLeftText(1)).toBe("1 try left");
  });

  it("writes the reconnect wait in whole seconds, rounded up", () => {
    expect(secondsText(500)).toBe("1 second");
    expect(secondsText(0)).toBe("1 second");
    expect(secondsText(7200)).toBe("8 seconds");
    expect(secondsText(30_000)).toBe("30 seconds");
  });

  it("leaves a zero part out of the agents line", () => {
    expect(agentsAsOfText(1, 1)).toBe(
      "1 running, 1 waiting for you. If the computer is on, they keep running. Anything that needs you waits.",
    );
    expect(agentsAsOfText(2, 0)).toBe("2 running. If the computer is on, they keep running.");
    expect(agentsAsOfText(0, 3)).toBe("3 waiting for you. Anything that needs you waits.");
    expect(agentsAsOfText(0, 0)).toBe("Nothing was running or waiting for you.");
  });

  it("reads a visible dot as a comma, and a code character by character", () => {
    expect(spoken("Tim's laptop · This Wi-Fi")).toBe("Tim's laptop, This Wi-Fi");
    expect(spelled("4F7 · 2KQ")).toBe("4, F, 7, 2, K, Q");
    expect(spelled("7KQ2 M4XD 9TH6")).toBe("7, K, Q, 2, M, 4, X, D, 9, T, H, 6");
  });
});
