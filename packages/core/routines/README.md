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

`wallTime` reads the wall clock of an instant in an IANA time zone, with the
standard `Intl` APIs only. `checkTimeZone` turns an unknown zone into a
readable `CronError`.

Each behaviour has a requirement in [`requirements/`](requirements/).

## Example

```ts
import { parseCron } from "@halonicjs/routines";

const cron = parseCron("*/15 8-18/2 * jan,dec mon-fri");
cron.minutes; // Set {0, 15, 30, 45}
cron.weekdays; // Set {1, 2, 3, 4, 5}
```
