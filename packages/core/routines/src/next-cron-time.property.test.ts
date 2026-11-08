import { verifies } from "@halonicjs/testing-spec";
import fc from "fast-check";
import { expect, it } from "vitest";
import { nextCronTime } from "./next-cron-time.ts";
import { type Cron, parseCron } from "./parse-cron.ts";

// Properties are checked against a brute-force oracle that walks every real
// minute. The oracle reads the zone's UTC offset by name ("GMT-04:00") rather
// than through wallTime, so a mistake in the code under test can't hide in it.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A fixed seed keeps the run the same every time (no flaky tests); a failure
// prints its own seed and path to replay it.
const SEED = 302;

// The oracle walks every minute, but reads Intl once per steady hour, so a run
// takes well under a second here; this leaves room for a slow CI runner.
const PROPERTY_TIMEOUT = 30_000;

const ZONES = [
  "UTC",
  "America/New_York", // one hour at 02:00
  "Europe/London", // one hour at 01:00 UTC
  "Australia/Lord_Howe", // 30 minutes
  "America/Santiago", // at midnight, so whole days start at 01:00 or run 25 hours
  "Asia/Kathmandu", // no DST, but a 45-minute offset
] as const;

type Zone = (typeof ZONES)[number];

function offsetReader(zone: Zone): (instant: number) => number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  });
  const read = (instant: number): number => {
    const name = formatter.formatToParts(instant).find((part) => part.type === "timeZoneName");
    const match = /GMT([+-])(\d\d):(\d\d)/.exec(name?.value ?? "");
    if (!match) return 0; // plain "GMT"
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return (match[1] === "-" ? -minutes : minutes) * MINUTE;
  };
  // Asking Intl for every minute is what makes the oracle slow. An hour whose
  // first and last minute have the same offset has no change inside it (every
  // zone here changes at most once an hour), so one read covers the whole hour.
  // Hours with a change are read minute by minute.
  const steady = new Map<number, number | null>();
  return (instant) => {
    const hour = Math.floor(instant / HOUR);
    let offset = steady.get(hour);
    if (offset === undefined) {
      const first = read(hour * HOUR);
      offset = first === read(hour * HOUR + HOUR - MINUTE) ? first : null;
      steady.set(hour, offset);
    }
    return offset ?? read(instant);
  };
}

/** Whether a wall time, given as milliseconds with UTC fields, matches the cron. */
function matchesWall(cron: Cron, wallAsUtc: number): boolean {
  const wall = new Date(wallAsUtc);
  const dayOfMonth = cron.days.has(wall.getUTCDate());
  const dayOfWeek = cron.weekdays.has(wall.getUTCDay());
  const dayMatches = cron.dayOr
    ? dayOfMonth || dayOfWeek
    : (cron.daysAny || dayOfMonth) && (cron.weekdaysAny || dayOfWeek);
  return (
    dayMatches &&
    cron.months.has(wall.getUTCMonth() + 1) &&
    cron.hours.has(wall.getUTCHours()) &&
    cron.minutes.has(wall.getUTCMinutes())
  );
}

/**
 * Every minute the cron fires strictly after `after` and up to `end`, at most
 * `limit` of them, by walking every real minute. A wildcard hour job fires
 * whenever the wall time matches. A job at set hours fires when the wall time
 * matches and hasn't been shown before, and at the first minute after the
 * clocks jump over a matching wall time.
 */
function bruteForceFirings(
  cron: Cron,
  zone: Zone,
  after: number,
  end: number,
  limit: number,
): number[] {
  const offsetAt = offsetReader(zone);
  const first = Math.floor(after / MINUTE) * MINUTE + MINUTE;
  const shown = new Set<number>();
  const found: number[] = [];
  // Start a day early, so wall times shown before `after` count as shown.
  let instant = first - DAY;
  let offsetBefore = offsetAt(instant - MINUTE);
  for (; instant <= end; instant += MINUTE) {
    const offset = offsetAt(instant);
    const wall = instant + offset;
    const fires = cron.hoursWildcard
      ? matchesWall(cron, wall)
      : (matchesWall(cron, wall) && !shown.has(wall)) ||
        jumpedOver(wall, offset - offsetBefore).some((skipped) => matchesWall(cron, skipped));
    shown.add(wall);
    offsetBefore = offset;
    if (instant >= first && fires) found.push(instant);
    if (found.length === limit) break;
  }
  return found;
}

/** The wall times the clocks jumped over just before `wall` when they went forward by `jump`. */
function jumpedOver(wall: number, jump: number): number[] {
  const skipped: number[] = [];
  for (let back = jump; back > 0; back -= MINUTE) skipped.push(wall - back);
  return skipped;
}

/** The instants in 2026 where the zone's offset changes, found by scanning hour by hour. */
function offsetChanges(zone: Zone): number[] {
  const offsetAt = offsetReader(zone);
  const changes: number[] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let hour = start; hour < Date.UTC(2027, 0, 1); hour += HOUR) {
    if (offsetAt(hour) === offsetAt(hour + HOUR)) continue;
    let minute = hour + MINUTE;
    while (offsetAt(minute) === offsetAt(hour)) minute += MINUTE;
    changes.push(minute);
  }
  return changes;
}

const CHANGES = new Map(ZONES.map((zone) => [zone, offsetChanges(zone)]));

function list(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .uniqueArray(fc.integer({ min, max }), { minLength: 1, maxLength: 4 })
    .map((values) => values.join(","));
}

/** Cron expressions that mix `*`, steps, lists and ranges, leaning towards ones that match often. */
const cronExpression = fc
  .tuple(
    fc.oneof(
      fc.constant("*"),
      fc.integer({ min: 1, max: 30 }).map((step) => `*/${step}`),
      list(0, 59),
    ),
    fc.oneof(
      { weight: 3, arbitrary: fc.constant("*") },
      { weight: 1, arbitrary: fc.integer({ min: 1, max: 5 }).map((step) => `*/${step}`) },
      { weight: 2, arbitrary: list(0, 23) },
      { weight: 1, arbitrary: fc.constantFrom("0-3", "1-2", "22-23/1", "23,0,1") },
    ),
    fc.oneof({ weight: 4, arbitrary: fc.constant("*") }, { weight: 1, arbitrary: list(1, 31) }),
    fc.oneof({ weight: 6, arbitrary: fc.constant("*") }, { weight: 1, arbitrary: list(1, 12) }),
    fc.oneof({ weight: 3, arbitrary: fc.constant("*") }, { weight: 1, arbitrary: list(0, 7) }),
  )
  .map((fields) => fields.join(" "));

/** A zone and a time near one of its 2026 offset changes, or anywhere in 2026 if it has none. */
const zoneAndTime = fc
  .record({
    zone: fc.constantFrom(...ZONES),
    pick: fc.nat(),
    shift: fc.integer({ min: -28 * HOUR, max: 2 * HOUR }),
    anywhere: fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2027, 0, 1) }),
  })
  .map(({ zone, pick, shift, anywhere }) => {
    const changes = CHANGES.get(zone) ?? [];
    const change = changes[pick % Math.max(changes.length, 1)];
    return { zone, after: change === undefined ? anywhere : change + shift };
  });

verifies("routines.next-cron-time-steps-every-match", () => {
  it("finds the zones' offset changes the properties lean on", () => {
    // A guard for the generators: without these, the DST cases would quietly vanish.
    expect(CHANGES.get("America/New_York")).toEqual([
      Date.parse("2026-03-08T07:00:00Z"),
      Date.parse("2026-11-01T06:00:00Z"),
    ]);
    expect(CHANGES.get("Australia/Lord_Howe")).toHaveLength(2);
    expect(CHANGES.get("America/Santiago")).toHaveLength(2);
  });

  it("does not skip Monday's first hour after London springs forward (found by this property)", () => {
    const after = new Date("2026-03-29T00:58:59.999Z"); // Sunday 00:58 GMT
    const expected = bruteForceFirings(
      parseCron("*/1 * * * 1"),
      "Europe/London",
      after.getTime(),
      Infinity,
      1,
    );
    expect(expected).toEqual([Date.parse("2026-03-29T23:00:00Z")]); // Monday 00:00 BST
    expect(nextCronTime("*/1 * * * 1", after, "Europe/London")?.toISOString()).toBe(
      "2026-03-29T23:00:00.000Z",
    );
  });

  it(
    "stepping from one time to the next visits exactly the firing minutes, across DST changes",
    () => {
      const window = 30 * HOUR;
      const limit = 40;
      fc.assert(
        fc.property(cronExpression, zoneAndTime, (expression, { zone, after }) => {
          const cron = parseCron(expression);
          const end = after + window;
          const expected = bruteForceFirings(cron, zone, after, end, limit);
          const visited: number[] = [];
          let next = nextCronTime(cron, new Date(after), zone);
          while (next !== null && next.getTime() <= end && visited.length < limit) {
            visited.push(next.getTime());
            next = nextCronTime(cron, next, zone);
          }
          expect(visited.map((x) => new Date(x).toISOString())).toEqual(
            expected.map((x) => new Date(x).toISOString()),
          );
        }),
        { seed: SEED, numRuns: 150 },
      );
    },
    PROPERTY_TIMEOUT,
  );
});

verifies("routines.next-cron-time-is-later", () => {
  it(
    "is always a firing whole minute later than the given time, or null",
    () => {
      const anyCron = fc.oneof(
        cronExpression,
        fc.constantFrom("0 0 29 2 *", "0 0 30 2 *", "@yearly", "0 9 13 * 5", "59 23 31 12 *"),
      );
      const anyTime = fc.integer({ min: Date.UTC(1990, 0, 1), max: Date.UTC(2090, 0, 1) });
      fc.assert(
        fc.property(anyCron, fc.constantFrom(...ZONES), anyTime, (expression, zone, after) => {
          const cron = parseCron(expression);
          const next = nextCronTime(cron, new Date(after), zone);
          if (next === null) return;
          expect(next.getTime()).toBeGreaterThan(after);
          expect(next.getTime() % MINUTE).toBe(0);
          const firing = next.getTime();
          expect(bruteForceFirings(cron, zone, firing - MINUTE, firing, 1)).toEqual([firing]);
        }),
        { seed: SEED, numRuns: 150 },
      );
    },
    PROPERTY_TIMEOUT,
  );
});
