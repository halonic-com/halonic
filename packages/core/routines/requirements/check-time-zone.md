# routines.check-time-zone

- Status: active
- Since: 0.1.0
- Source: `checkTimeZone` in the old routines package (`packages/core/routines/src/cron.ts`) at 784f78d

If a routine names a time zone that the runtime's `Intl` data doesn't know, then the time-zone check shall throw a `CronError` that names the zone.

## Examples

- Given "Mars/Olympus", when it is checked, then a `CronError` says `Unknown time zone "Mars/Olympus".`
- Given "Europe/Amsterdam" or "UTC", when it is checked, then nothing is thrown.
