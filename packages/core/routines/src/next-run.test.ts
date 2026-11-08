import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { nextRun } from "./next-run.ts";

const at = (iso: string) => new Date(iso);
const iso = (date: Date | null) => date?.toISOString() ?? null;

verifies("routines.next-run", () => {
  // Ported from "parses intervals and computes the next run" at 784f78d (the
  // nextRun lines; the parseEvery lines are in parse-every.test.ts).
  it("starts an interval that never ran now", () => {
    expect(iso(nextRun({ every: "1h" }, at("2026-11-03T10:00:00Z")))).toBe(
      "2026-11-03T10:00:00.000Z",
    );
  });

  it("starts an interval one interval after the last run", () => {
    const next = nextRun({ every: "1h" }, at("2026-11-03T10:00:00Z"), at("2026-11-03T09:30:00Z"));
    expect(iso(next)).toBe("2026-11-03T10:30:00.000Z");
  });

  it("starts an overdue interval now", () => {
    const next = nextRun({ every: "1h" }, at("2026-11-03T10:00:00Z"), at("2026-11-03T07:00:00Z"));
    expect(iso(next)).toBe("2026-11-03T10:00:00.000Z");
  });

  it("gives the next cron time for a schedule", () => {
    const trigger = { schedule: "0 8 * * *", timezone: "UTC" };
    expect(iso(nextRun(trigger, at("2026-11-03T10:00:00Z")))).toBe("2026-11-04T08:00:00.000Z");
  });

  it("gives null for a trigger that doesn't fire on a clock", () => {
    const after = at("2026-11-03T10:00:00Z");
    expect(nextRun({ manual: true }, after)).toBeNull();
    expect(nextRun({ signal: { name: "ready" } }, after)).toBeNull();
    expect(
      nextRun({ mail: { connector: "gmail", query: "in:inbox", every: "2m" } }, after),
    ).toBeNull();
  });
});
