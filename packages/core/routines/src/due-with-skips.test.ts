import type { Routine } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { due, type PlacedRoutine } from "./due.ts";
import { dueWithSkips, type SkippedRange } from "./due-with-skips.ts";

// The Acme example of the skipped-and-catch-up document (HAL-2538), in UTC:
// the laptop slept from Fri 6 Nov 18:00 and woke on Mon 9 Nov at 08:12.
const friday = new Date("2026-11-06T18:00:00Z");
const monday = new Date("2026-11-09T08:12:00Z");
const hourly = { schedule: "0 * * * *", timezone: "UTC" };

function placed(trigger: object, catchUp: Routine["catchUp"], enabled = true): PlacedRoutine {
  const routine = {
    version: 1,
    id: "support-replies",
    name: "Support replies",
    enabled,
    trigger,
    overlap: "skip",
    catchUp,
    run: { workflow: "support-reply", input: {} },
  } as unknown as Routine;
  return { hub: "acme", routine };
}

const range = (
  reason: SkippedRange["reason"],
  from: string,
  to: string,
  count: number,
): SkippedRange => ({
  key: "acme/support-replies",
  reason,
  from: new Date(from),
  to: new Date(to),
  count,
});

verifies("routines.skipped-times", () => {
  it("runs the latest time with the count of the older ones for 'last'", () => {
    const { runs, skipped } = dueWithSkips([placed(hourly, "last")], friday, monday);
    expect(runs.map((run) => [run.at.toISOString(), run.catchUp])).toEqual([
      ["2026-11-09T08:00:00.000Z", { skipped: 61 }],
    ]);
    expect(skipped).toEqual([range("latest", "2026-11-06T19:00Z", "2026-11-09T07:00Z", 61)]);
  });

  it("drops every time as missed for 'none', also past the window", () => {
    const { runs, skipped } = dueWithSkips([placed(hourly, "none")], friday, monday);
    expect(runs).toEqual([]);
    expect(skipped).toEqual([range("missed", "2026-11-06T19:00Z", "2026-11-09T08:00Z", 62)]);
    const twoWeeks = dueWithSkips(
      [placed(hourly, "none")],
      new Date("2026-10-25T18:00:00Z"),
      monday,
    );
    expect(twoWeeks.skipped.map((dropped) => [dropped.reason, dropped.count])).toEqual([
      ["missed", 350],
    ]);
  });

  it("gives times past the window and past the cap their own reason for 'all'", () => {
    const routines = [placed(hourly, "all")];
    const lastTick = new Date("2026-10-25T18:00:00Z");
    const { runs, skipped } = dueWithSkips(routines, lastTick, monday);
    expect(runs.map((run) => run.at)).toEqual(due(routines, lastTick, monday).map((run) => run.at));
    expect(runs.length).toBe(100);
    expect(runs[0]?.catchUp).toEqual({ skipped: 250 });
    expect(runs.slice(1).every((run) => run.catchUp?.skipped === 0)).toBe(true);
    expect(skipped).toEqual([
      range("window", "2026-10-25T19:00Z", "2026-11-02T08:00Z", 182),
      range("cap", "2026-11-02T09:00Z", "2026-11-05T04:00Z", 68),
    ]);
  });

  it("marks a late run with nothing dropped, and leaves a run on time unmarked", () => {
    const weekdays = placed({ schedule: "30 7 * * 1-5", timezone: "UTC" }, "last");
    const late = dueWithSkips([weekdays], friday, monday);
    expect(late.runs.map((run) => run.catchUp)).toEqual([{ skipped: 0 }]);
    expect(late.skipped).toEqual([]);
    const onTime = dueWithSkips(
      [placed(hourly, "last")],
      new Date("2026-11-09T07:00:30Z"),
      new Date("2026-11-09T08:00:30Z"),
    );
    expect(onTime.runs.length).toBe(1);
    expect(onTime.runs[0]).not.toHaveProperty("catchUp");
  });

  // Counting walks 10,000 cron times, about a second here; the timeout leaves room for a slow CI runner.
  it("stops counting a cron at 10,000 and marks the count as a minimum", () => {
    // Every minute but 23:xx, so at 23:30 the newest time is half an hour late.
    const minutes = placed({ schedule: "* 0-22 * * *", timezone: "UTC" }, "last");
    const { runs, skipped } = dueWithSkips(
      [minutes],
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-11-09T23:30:00Z"),
    );
    expect(
      skipped.map((dropped) => [dropped.reason, dropped.count, dropped.countIsMinimum]),
    ).toEqual([
      ["window", 10_000, true],
      ["latest", 7 * 23 * 60 - 1, undefined],
    ]);
    expect(runs.map((run) => [run.at.toISOString(), run.catchUp])).toEqual([
      ["2026-11-09T22:59:00.000Z", { skipped: 10_000, countIsMinimum: true }],
    ]);
  }, 30_000);

  it("counts an interval exactly, however long the window", () => {
    const everyMinute = placed({ every: "1m" }, "none");
    const { skipped } = dueWithSkips([everyMinute], new Date("2026-10-26T08:12:00Z"), monday);
    expect(skipped).toEqual([
      {
        key: "acme/support-replies",
        reason: "missed",
        from: new Date("2026-10-26T08:13:00Z"),
        to: new Date("2026-11-09T08:10:00Z"),
        count: 14 * 24 * 60 - 2,
      },
    ]);
  });

  it("gives disabled routines and the first tick nothing", () => {
    expect(dueWithSkips([placed(hourly, "last", false)], friday, monday)).toEqual({
      runs: [],
      skipped: [],
    });
    expect(dueWithSkips([placed(hourly, "last")], null, monday)).toEqual({ runs: [], skipped: [] });
    const broken = placed({ schedule: "not a cron" }, "last");
    expect(dueWithSkips([broken], friday, monday)).toEqual({ runs: [], skipped: [] });
  });
});
