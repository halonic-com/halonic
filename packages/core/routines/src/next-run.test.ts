import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { CronError } from "./cron-error.ts";
import { due, type PlacedRoutine } from "./due.ts";
import { nextRun } from "./next-run.ts";

const at = (iso: string) => new Date(iso);
const iso = (date: Date | null) => date?.toISOString() ?? null;

verifies("routines.next-run", () => {
  // The old nextRun counted an interval from the last run (784f78d, "parses
  // intervals and computes the next run"). It now gives the epoch slot `due`
  // starts, so the two always agree.
  it("gives an interval's next slot counted from the epoch", () => {
    expect(iso(nextRun({ every: "1h" }, at("2026-11-03T10:00:00Z")))).toBe(
      "2026-11-03T11:00:00.000Z",
    );
    expect(iso(nextRun({ every: "30m" }, at("2026-11-03T09:50:00Z")))).toBe(
      "2026-11-03T10:00:00.000Z",
    );
  });

  it("gives the interval slot due starts, after a run at 09:45", () => {
    const trigger = { every: "30m" };
    const lastTick = at("2026-11-03T09:46:00Z");
    const next = nextRun(trigger, lastTick);
    const routine = {
      hub: "h",
      routine: { id: "r1", enabled: true, trigger, catchUp: "last" },
    } as unknown as PlacedRoutine;
    const runs = due([routine], lastTick, at("2026-11-03T10:20:00Z"));
    expect(iso(next)).toBe("2026-11-03T10:00:00.000Z");
    expect(runs.map((run) => run.at.toISOString())).toEqual([iso(next)]);
  });

  it("gives the next cron time for a schedule", () => {
    const trigger = { schedule: "0 8 * * *", timezone: "UTC" };
    expect(iso(nextRun(trigger, at("2026-11-03T10:00:00Z")))).toBe("2026-11-04T08:00:00.000Z");
  });

  it("uses the given zone for a schedule that names none, as due does", () => {
    const after = at("2026-11-03T10:00:00Z");
    expect(iso(nextRun({ schedule: "0 9 * * *" }, after))).toBe("2026-11-04T09:00:00.000Z");
    expect(iso(nextRun({ schedule: "0 9 * * *" }, after, "Asia/Tokyo"))).toBe(
      "2026-11-04T00:00:00.000Z",
    );
  });

  it("throws a CronError for an unknown zone", () => {
    const after = at("2026-11-03T10:00:00Z");
    expect(() => nextRun({ schedule: "0 9 * * *", timezone: "Mars/Olympus" }, after)).toThrow(
      CronError,
    );
    expect(() => nextRun({ schedule: "0 9 * * *" }, after, "Mars/Olympus")).toThrow(CronError);
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
