import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { lastRunOutcome, runWhen } from "./list-words.ts";

const now = new Date(2026, 10, 15, 12, 0);

verifies("workflows.list.rows-and-states", () => {
  it("names the day of a run: Today, Yesterday, then the date, with the year when it isn't this year's", () => {
    expect(runWhen(new Date(2026, 10, 15, 9, 5).toISOString(), now)).toBe("Today 09:05");
    expect(runWhen(new Date(2026, 10, 14, 18, 30).toISOString(), now)).toBe("Yesterday 18:30");
    expect(runWhen(new Date(2026, 10, 6, 9, 5).toISOString(), now)).toBe("Fri 6 Nov 09:05");
    expect(runWhen(new Date(2025, 11, 30, 9, 5).toISOString(), now)).toBe("Tue 30 Dec 2025 09:05");
  });

  it("gives a finished run a glyph and the words a screen reader hears, and a run still going neither", () => {
    expect(lastRunOutcome.completed).toEqual({ glyph: "✓", spoken: "completed" });
    expect(lastRunOutcome.failed).toEqual({ glyph: "✕", spoken: "failed" });
    expect(lastRunOutcome["cant-try"]).toEqual({ glyph: "✕", spoken: "couldn't start" });
    expect(lastRunOutcome.running).toBeNull();
    expect(lastRunOutcome.waiting).toBeNull();
  });
});
