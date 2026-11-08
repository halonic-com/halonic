# routines.next-cron-time-is-later

- Status: active
- Since: 0.1.0
- Source: new; a property the task (HAL-302) asks for

When the next cron time is found, it shall be a whole minute strictly later than the given time at which the cron fires (see `routines.next-cron-time-dst`), or null.

## Examples

- Given any generated cron expression, including ones that rarely or never match (`0 0 29 2 *`, `0 0 30 2 *`), one of six zones and any time from 1990 to 2090, when the next time is asked for, then it is null or a whole minute later than that time at which the brute-force walk also says the cron fires.
