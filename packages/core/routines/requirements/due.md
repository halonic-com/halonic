# routines.due

- Status: active
- Since: 0.1.0
- Source: new; the old code had no pure tick (its scheduler kept each routine's last run and fired itself)

When asked which routines are due for a tick, the routines package shall return, for each enabled routine with a `schedule` or `every` trigger, the times in the window after the last tick up to and including now that the routine's `catchUp` allows, oldest first and ties by key. `none` keeps only times within the grace period of now, `last` the newest time, `all` the newest times, up to the catch-up cap, still oldest first. However long the window, every setting finds its times as if it were short. Older times past the cap, or past the limit of 10,000 times on any one walk through a window, are dropped, not caught up on the next tick. Interval times count from the Unix epoch in UTC, so the same time comes out on every tick. A schedule without a time zone uses the policy's zone. With no last tick, or when now is not after it, nothing is due. A routine whose cron or interval does not parse, or whose schedule is in a zone the runtime doesn't know (its own or, without one, the policy's), is skipped, and the other routines are still due. Manual, signal and mail triggers are never due here.

## Examples

- Given `every: "15m"` with `catchUp: "last"`, a last tick at 08:01 and now 08:40, when the tick runs, then one run is due at 08:30.
- Given `0 * * * *` with `catchUp: "all"`, a last tick at 08:30 and now 11:10, when the tick runs, then runs are due at 09:00, 10:00 and 11:00.
- Given the same routine and window with a catch-up cap of 2, when the tick runs, then runs are due at 10:00 and 11:00, and 09:00 is dropped.
- Given `0 * * * *` with `catchUp: "none"`, a last tick at 08:30 and now 10:00:30, when the tick runs, then only 10:00 is due.
- Given `* * * * *` with `catchUp: "last"`, a last tick at 2026-11-01 00:00 and now 2026-11-10 00:00:30, when the tick runs, then one run is due at 2026-11-10 00:00.
- Given `every: "1m"` with `catchUp: "none"` and the same nine-day window, when the tick runs, then only 2026-11-10 00:00 is due.
- Given a last tick of null, when the tick runs, then nothing is due.
- Given a routine with `enabled: false`, when the tick runs, then nothing is due for it.
- Given a schedule in "Mars/Olympus" and an hourly schedule in UTC, when the tick runs, then only the UTC routine is due.
