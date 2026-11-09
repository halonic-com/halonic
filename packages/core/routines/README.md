# @halonicjs/routines

Routine schedules: cron, intervals and triggers, and the tick that decides which routines are due, with catch-up for missed ticks.

- **Layer:** core
- **Owner:** mateo
- **Public API:** `@halonicjs/routines`

Cron expressions have the usual five fields (minute hour day-of-month month
day-of-week), with `*`, values, ranges, steps, lists, month and weekday names,
and the `@daily`-style macros. When both day fields are restricted, a day that
matches either one counts, as in classic cron. A bad expression throws a
`CronError` whose message can be shown to the user as it is.

`nextCronTime` finds the next minute a cron fires in an IANA time zone. It
handles daylight saving time as classic cron does: a job at set hours, such as
`30 1 * * *`, fires once in a repeated autumn hour and, when the clocks skip
its time in spring, right after the gap; a job with a wildcard hour, such as
`*/15 * * * *`, follows the wall clock through both.

`wallTime` reads the wall clock of an instant in an IANA time zone, with the
standard `Intl` APIs only. `checkTimeZone` turns an unknown zone into a
readable `CronError`.

`describeCron` writes an expression out in words for people, such as
"Weekdays at 08:00", and falls back to `Cron "<expression>"` for shapes
without a short phrase.

Each behaviour has a requirement in [`requirements/`](requirements/).

## Example

Read one routine's trigger, ask what is due at a fixed moment and list its next due times in a time
zone. The code lives in [`examples/next-due-times.ts`](examples/next-due-times.ts), where it is
typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/routines` as below.

```ts
import type { Routine } from "@halonicjs/format";
import { due, nextRun, occurrences } from "@halonicjs/routines";

// One routine: every weekday at 08:00 in Amsterdam. Normally it comes from a
// `*.routine.yaml` file read with @halonicjs/format.
const routine: Routine = {
  version: 1,
  id: "morning-brief",
  name: "Morning brief",
  enabled: true,
  trigger: { schedule: "0 8 * * 1-5", timezone: "Europe/Amsterdam" },
  run: { workflow: "brief", input: {} },
  overlap: "skip",
  catchUp: "last",
};

// A fixed clock keeps the output the same on every run: Monday 9 November 2026, 08:05 in Amsterdam.
const now = new Date("2026-11-09T07:05:00Z");

/** Reads one routine's trigger and lists what is due now and its next due times. */
export function runExample(): { dueNow: string[]; next: string | null; nextWeek: string[] } {
  // What a tick at `now` starts, when the last tick was on Friday afternoon.
  const lastTick = new Date("2026-11-06T15:00:00Z");
  const runs = due([{ hub: null, routine }], lastTick, now);
  const dueNow = runs.map((run) => `${run.key} at ${run.at.toISOString()}`);
  // ["@workspace/morning-brief at 2026-11-09T07:00:00.000Z"]

  // The next time the trigger fires, strictly after now.
  const next = nextRun(routine.trigger, now)?.toISOString() ?? null; // "2026-11-10T07:00:00.000Z"

  // Every time it fires in the coming week; the weekend is skipped.
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeek = occurrences(routine.trigger, now, weekEnd).map((at) => at.toISOString());

  return { dueNow, next, nextWeek };
}
```
