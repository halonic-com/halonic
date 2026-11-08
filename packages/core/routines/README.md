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

```ts
import { nextCronTime, parseCron } from "@halonicjs/routines";

const cron = parseCron("*/15 8-18/2 * jan,dec mon-fri");
cron.minutes; // Set {0, 15, 30, 45}
cron.weekdays; // Set {1, 2, 3, 4, 5}

// Weekdays at 08:00 in Amsterdam, after Friday 6 November 2026 09:00 UTC:
nextCronTime("0 8 * * 1-5", new Date("2026-11-06T09:00:00Z"), "Europe/Amsterdam");
// 2026-11-09T07:00:00.000Z (Monday 08:00 CET)
```
