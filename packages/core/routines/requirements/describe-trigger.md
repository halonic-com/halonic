# routines.describe-trigger

- Status: active
- Since: 0.1.0
- Source: `describeTrigger` in the old routines package (`packages/core/routines/src/describe.ts`) at 784f78d

The routines package shall write a trigger out in words for people: a schedule as its cron description followed by its time zone in brackets, an interval in the largest unit that divides it (followed by "(UTC)" when that unit is hours or days, because interval slots count from the epoch in UTC), a signal and a mail trigger by what they wait for, and a manual trigger as "Manual only". When a schedule or interval doesn't parse, it shall return text that says so and not throw.

## Examples

- Given `0 8 * * 1-5` in Europe/Amsterdam, when it is described, then it reads `Weekdays at 08:00 (Europe/Amsterdam)`.
- Given `every: 120m`, when it is described, then it reads `Every 2 hours (UTC)`.
- Given the schedule `nope`, when it is described, then it reads `Invalid schedule "nope"`.
