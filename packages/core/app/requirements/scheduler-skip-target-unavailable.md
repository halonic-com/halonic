# app.scheduler-skip-target-unavailable

- Status: active
- Since: 0.1.0
- Source: engine answer point 4, the seventh skip reason (HAL-3267); flow-routines rev 20, 2.4 and 3.9 (Sofia's decision on "in the trash"); stub `app.scheduler.skip-target-unavailable` in req-core-routines (HAL-3246)

When a tick of the routine scheduler would start a due run and the host's `targetUnavailable` check says the routine's target can't be started, the routine scheduler shall not start the run, and shall add the time to the routine's skip records (`app.skip-records`) with the reason `target-unavailable` and its `why`: `never-live` when the target has never been in a version, `in-trash` when it is live but its saved file is gone. It shall ask only about the runs the tick would start, after the tick's own skip reasons, so a time already skipped or queued keeps that reason. Times with a different `why` shall make different rows. If the check throws, then the scheduler shall report that run as failed, not start it, and still start the others. Without a check, every run shall start as before.

## Examples

- Given routine "morning" whose target was never live, when 08:00 is due, then no run starts and its records get the row `target-unavailable`, `never-live`, 08:00 ("08:00 Tue: Briefing isn't live yet").
- Given the 08:00 and 09:00 times skipped as `never-live` and the 10:00 time as `in-trash`, then the records hold two rows: 10:00 `in-trash`, and 08:00–09:00 `never-live` with a count of 2.
- Given 09:00 skipped as busy while the 08:00 run is going, when the tick runs, then the check isn't asked about 09:00 and the row stays `busy`.
- Given two routines due at 08:00 and a check that throws for one, then that one is reported as failed and the other starts.
- Given a stored row `target-unavailable` without a `why`, or with one that isn't known, then reading the records leaves it out.
