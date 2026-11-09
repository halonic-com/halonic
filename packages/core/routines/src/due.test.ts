import type { Routine } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_TICK_POLICY, due, type PlacedRoutine } from "./due.ts";
import { occurrences } from "./occurrences.ts";

const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();

function placed(
  trigger: object,
  catchUp: Routine["catchUp"] = "last",
  enabled = true,
  id = "r1",
): PlacedRoutine {
  const routine = {
    version: 1,
    id,
    name: id,
    enabled,
    trigger,
    overlap: "skip",
    catchUp,
    run: { workflow: "w", input: {} },
  } as unknown as Routine;
  return { hub: "h", routine };
}
const times = (runs: ReturnType<typeof due>) => runs.map((run) => iso(run.at));
const hourly = { schedule: "0 * * * *", timezone: "UTC" };

// Each walk these compare against makes up to a thousand cron lookups per
// case, well under a second here; this leaves room for a slow CI runner. A
// fixed seed keeps every run the same (no flaky tests).
const PROPERTY_TIMEOUT = 30_000;
const SEED = 287;

verifies("routines.due", () => {
  it("gives the newest quarter hour for catchUp last", () => {
    const runs = due(
      [placed({ every: "15m" })],
      at("2026-11-03T08:01:00Z"),
      at("2026-11-03T08:40:00Z"),
    );
    expect(times(runs)).toEqual(["2026-11-03T08:30:00.000Z"]);
    expect(runs[0]?.key).toBe("h/r1");
    expect(runs[0]?.trigger).toBe("every");
  });

  it("gives every missed time for catchUp all, up to the cap", () => {
    const routine = placed(hourly, "all");
    const runs = due([routine], at("2026-11-03T08:30:00Z"), at("2026-11-03T11:10:00Z"));
    expect(times(runs)).toEqual([
      "2026-11-03T09:00:00.000Z",
      "2026-11-03T10:00:00.000Z",
      "2026-11-03T11:00:00.000Z",
    ]);
    const capped = due([routine], at("2026-11-03T08:30:00Z"), at("2026-11-03T11:10:00Z"), {
      ...DEFAULT_TICK_POLICY,
      maxCatchUp: 2,
    });
    expect(times(capped)).toEqual(["2026-11-03T10:00:00.000Z", "2026-11-03T11:00:00.000Z"]);
  });

  it("keeps the newest times past the cap for catchUp all, oldest first, on an interval", () => {
    const runs = due(
      [placed({ every: "15m" }, "all")],
      at("2026-11-03T08:01:00Z"),
      at("2026-11-03T09:10:00Z"),
      { ...DEFAULT_TICK_POLICY, maxCatchUp: 2 },
    );
    expect(times(runs)).toEqual(["2026-11-03T08:45:00.000Z", "2026-11-03T09:00:00.000Z"]);
  });

  it("gives only on-time times for catchUp none", () => {
    const routine = placed(hourly, "none");
    expect(times(due([routine], at("2026-11-03T08:30:00Z"), at("2026-11-03T10:00:30Z")))).toEqual([
      "2026-11-03T10:00:00.000Z",
    ]);
    expect(due([routine], at("2026-11-03T08:30:00Z"), at("2026-11-03T10:30:00Z"))).toEqual([]);
  });

  it("gives the newest time for catchUp last on a schedule", () => {
    const runs = due(
      [placed(hourly, "last")],
      at("2026-11-03T08:30:00Z"),
      at("2026-11-03T11:10:00Z"),
    );
    expect(times(runs)).toEqual(["2026-11-03T11:00:00.000Z"]);
  });

  it("gives nothing without a last tick, or when now is not after it", () => {
    expect(due([placed(hourly)], null, at("2026-11-03T11:10:00Z"))).toEqual([]);
    expect(due([placed(hourly)], at("2026-11-03T11:10:00Z"), at("2026-11-03T11:10:00Z"))).toEqual(
      [],
    );
  });

  it("skips disabled routines, other triggers and bad triggers", () => {
    const routines = [
      placed(hourly, "all", false, "off"),
      placed({ manual: true }, "all", true, "manual"),
      placed({ schedule: "nope" }, "all", true, "bad"),
      placed({ every: "soon" }, "all", true, "worse"),
    ];
    expect(due(routines, at("2026-11-03T08:30:00Z"), at("2026-11-03T11:10:00Z"))).toEqual([]);
  });

  it("uses the policy zone when the schedule names none, and the workspace key without a hub", () => {
    const routine = { ...placed({ schedule: "0 9 * * *" }), hub: null };
    const policy = { ...DEFAULT_TICK_POLICY, timeZone: "Asia/Tokyo" };
    const runs = due([routine], at("2026-11-02T23:00:00Z"), at("2026-11-03T01:00:00Z"), policy);
    expect(runs[0]?.key).toBe("@workspace/r1");
    expect(runs[0]?.at.toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  it("skips a schedule in an unknown zone and still starts the others", () => {
    const routines = [
      placed({ schedule: "0 * * * *", timezone: "Mars/Olympus" }, "last", true, "mars"),
      placed(hourly, "last", true, "earth"),
    ];
    const runs = due(routines, at("2026-11-03T08:30:00Z"), at("2026-11-03T09:10:00Z"));
    expect(runs.map((run) => run.key)).toEqual(["h/earth"]);
  });

  it("skips only the zoneless schedules when the policy zone is unknown", () => {
    const routines = [
      placed({ schedule: "0 * * * *" }, "last", true, "zoneless"),
      placed(hourly, "last", true, "zoned"),
      placed({ every: "1h" }, "last", true, "interval"),
    ];
    const policy = { ...DEFAULT_TICK_POLICY, timeZone: "Mars/Olympus" };
    const runs = due(routines, at("2026-11-03T08:30:00Z"), at("2026-11-03T09:10:00Z"), policy);
    expect(runs.map((run) => run.key)).toEqual(["h/interval", "h/zoned"]);
  });

  describe("after a nine-day window", () => {
    // 12,960 minutes: more than one walk through the window lists.
    const lastTick = at("2026-11-01T00:00:00Z");
    const now = at("2026-11-10T00:00:30Z");
    const everyMinute = { schedule: "* * * * *", timezone: "UTC" };

    it.each([
      ["a schedule", everyMinute],
      ["an interval", { every: "1m" }],
    ])("gives the newest time for catchUp last on %s", (_name, trigger) => {
      expect(times(due([placed(trigger, "last")], lastTick, now))).toEqual([
        "2026-11-10T00:00:00.000Z",
      ]);
    });

    it.each([
      ["a schedule", everyMinute],
      ["an interval", { every: "1m" }],
    ])("gives the on-time time for catchUp none on %s", (_name, trigger) => {
      expect(times(due([placed(trigger, "none")], lastTick, now))).toEqual([
        "2026-11-10T00:00:00.000Z",
      ]);
    });

    it.each([
      ["a schedule", everyMinute],
      ["an interval", { every: "1m" }],
    ])("gives the newest times up to the cap for catchUp all on %s", (_name, trigger) => {
      const runs = due([placed(trigger, "all")], lastTick, now);
      expect(runs).toHaveLength(DEFAULT_TICK_POLICY.maxCatchUp);
      expect(runs[0]?.at.toISOString()).toBe("2026-11-09T22:21:00.000Z");
      expect(runs.at(-1)?.at.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    });

    it("finds a schedule's newest time long before now", () => {
      const runs = due([placed({ schedule: "30 6 2 11 *", timezone: "UTC" })], lastTick, now);
      expect(times(runs)).toEqual(["2026-11-02T06:30:00.000Z"]);
    });
  });

  it(
    "gives the same newest schedule times as walking the window for catchUp all",
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom("*/7 * * * *", "0 9 * * 1-5", "15 2,14 * * *"),
          fc.constantFrom("UTC", "America/New_York"),
          fc.integer({ min: 0, max: 40 * 86_400_000 }),
          fc.integer({ min: 1, max: 3 * 86_400_000 }),
          fc.integer({ min: 1, max: 20 }),
          (schedule, timezone, offset, length, maxCatchUp) => {
            const lastTick = new Date(at("2026-10-01T00:00:00Z").getTime() + offset);
            const now = new Date(lastTick.getTime() + length);
            const trigger = { schedule, timezone };
            const walked = occurrences(trigger, lastTick, now, 1_000).map(iso).slice(-maxCatchUp);
            const policy = { ...DEFAULT_TICK_POLICY, maxCatchUp };
            expect(times(due([placed(trigger, "all")], lastTick, now, policy))).toEqual(walked);
          },
        ),
        { numRuns: 30, seed: SEED },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it(
    "gives the same newest schedule time as walking the window",
    () => {
      const crons = ["*/7 * * * *", "0 9 * * 1-5", "15 2,14 * * *", "0 0 1 * *"];
      fc.assert(
        fc.property(
          fc.constantFrom(...crons),
          fc.constantFrom("UTC", "America/New_York"),
          fc.integer({ min: 0, max: 40 * 86_400_000 }),
          fc.integer({ min: 1, max: 3 * 86_400_000 }),
          (schedule, timezone, offset, length) => {
            const lastTick = new Date(at("2026-10-01T00:00:00Z").getTime() + offset);
            const now = new Date(lastTick.getTime() + length);
            const trigger = { schedule, timezone };
            const walked = occurrences(trigger, lastTick, now, 1_000).map(iso).slice(-1);
            expect(times(due([placed(trigger, "last")], lastTick, now))).toEqual(walked);
          },
        ),
        { numRuns: 30, seed: SEED },
      );
    },
    PROPERTY_TIMEOUT,
  );

  it("orders by time, then key", () => {
    const runs = due(
      [placed({ every: "1h" }, "last", true, "b"), placed({ every: "1h" }, "last", true, "a")],
      at("2026-11-03T08:10:00Z"),
      at("2026-11-03T09:10:00Z"),
    );
    expect(runs.map((run) => run.key)).toEqual(["h/a", "h/b"]);
  });
});

verifies("routines.due-exactly-once", () => {
  it("makes each time due exactly once across late and repeated ticks", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 6 * 3_600_000 }), { minLength: 1, maxLength: 12 }),
        (steps) => {
          const start = at("2026-11-03T08:10:00Z").getTime();
          const routine = placed({ every: "1h" }, "all");
          let last = new Date(start);
          const started = new Set<string>();
          let now = start;
          const all: string[] = [];
          for (const step of steps) {
            now += step;
            const tick = new Date(now);
            for (const run of due([routine], last, tick)) {
              all.push(`${run.key}@${iso(run.at)}`);
              started.add(`${run.key}@${iso(run.at)}`);
            }
            if (tick > last) last = tick;
          }
          // Repeated ticks (step 0) add nothing; each time appears once.
          expect(all.length).toBe(new Set(all).size);
          const expected = Math.floor(now / 3_600_000) - Math.floor(start / 3_600_000);
          expect(started.size).toBe(expected);
        },
      ),
    );
  });
});
