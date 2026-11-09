# routines.trigger-error

- Status: active
- Since: 0.1.0
- Source: `triggerError` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

When a trigger can't be used, the routines package shall return the message of the first thing wrong with it: a cron that doesn't parse, an unknown time zone, or an interval that is not a count and a unit. When the trigger is fine it shall return null. The interval of a mail trigger is checked the same way as an `every` interval, so `15m` is accepted (see `format.routine-mail-interval`).

## Examples

- Given a schedule with the zone "Mars/Olympus", when it is checked, then the message says `Unknown time zone "Mars/Olympus".`
- Given `{ every: "0m" }`, when it is checked, then the message says it is not an interval.
- Given a mail trigger with `every: "15m"`, when it is checked, then the result is null.
