# routines.next-cron-time-steps-every-match

- Status: active
- Since: 0.1.0
- Source: new; a property the task (HAL-302) asks for

When the next cron time is asked for repeatedly, each time after the previous answer, the answers shall be exactly the real minutes at which the cron fires under the daylight saving rules of `routines.next-cron-time-dst`, in order, with none skipped, including across daylight saving changes.

## Examples

- Given any generated cron expression, one of six zones (UTC, New York, London, Lord Howe, Santiago, Kathmandu) and a start up to 28 hours before an offset change in 2026, when the next time is asked for repeatedly over 30 hours, then the answers equal a brute-force walk over every minute that reads the offset from `Intl` by name and applies the daylight saving rules on its own (it remembers every wall time already shown and looks at each jump).
- Given `*/1 * * * 1` in Europe/London from the evening before the spring change, when stepping through it, then no minute of Monday is skipped.
