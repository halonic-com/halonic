import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { listWords, runWhen } from "./list-words.ts";

const now = new Date(2026, 10, 15, 12, 0);

verifies("workflows.list.rows-and-states", () => {
  it("names the day of a run: Today, Yesterday, then the date, with the year when it isn't this year's", () => {
    expect(runWhen(new Date(2026, 10, 15, 9, 5).toISOString(), now)).toBe("Today 09:05");
    expect(runWhen(new Date(2026, 10, 14, 18, 30).toISOString(), now)).toBe("Yesterday 18:30");
    expect(runWhen(new Date(2026, 10, 6, 9, 5).toISOString(), now)).toBe("Fri 6 Nov 09:05");
    expect(runWhen(new Date(2025, 11, 30, 9, 5).toISOString(), now)).toBe("Tue 30 Dec 2025 09:05");
  });

  it("puts a glyph before a finished run's time and none before a run still going", () => {
    expect(listWords.lastRun("completed", "Today 09:05")).toBe("Last run ✓ Today 09:05");
    expect(listWords.lastRun("failed", "Today 09:05")).toBe("Last run ✕ Today 09:05");
    expect(listWords.lastRun("waiting", "Today 09:05")).toBe("Last run Today 09:05");
  });
});
