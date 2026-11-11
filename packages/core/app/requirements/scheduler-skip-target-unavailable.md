# app.scheduler-skip-target-unavailable

- Status: active
- Since: 0.1.0
- Source: engine answer point 4, the seventh skip reason (HAL-3267); flow-routines rev 20, 2.4 and 3.9 (Sofia's decisions on "in the trash" and, in HAL-5011, "isn't live"); stub `app.scheduler.skip-target-unavailable` in req-core-routines (HAL-3246); checked before the overlap rule from Liam's review of halonic#1580 (HAL-4876)

When a tick of the routine scheduler has due times for a routine whose overlap rule would start one of them, and the host's `targetUnavailable` check says the routine's target can't be started, the routine scheduler shall start none of them, and shall add every one of them to the routine's skip records (`app.skip-records`) with the reason `target-unavailable` and its `why`: `never-live` when the target isn't in the live version, `in-trash` when it is live but its saved file is gone. A target that was live once but has left the live version (moved to the trash, then a new version made) counts as `never-live`. It shall ask once per such routine, about its oldest due time, before the overlap rule, so no time is recorded as busy, or queued, behind a run that never starts. It shall not ask about a routine whose overlap rule starts nothing this tick, a routine with a run going and `overlap: skip` or `queue`, so its times keep that rule's reason; a routine with `overlap: allow` is asked even with a run going, since its times would start. It shall report the unavailable and failed times oldest first across routines. Times with a different `why` shall make different rows. If the check throws, then the scheduler shall report that routine's due times as failed, start none of them, and still start the other routines. Without a check, every run shall start as before.

## Examples

- Given routine "morning" whose target isn't in the live version, when 08:00 is due, then no run starts and its records get the row `target-unavailable`, `never-live`, 08:00 ("08:00 Tue: Briefing isn't live").
- Given the 08:00 and 09:00 times skipped as `never-live` and the 10:00 time as `in-trash`, then the records hold two rows: 10:00 `in-trash`, and 08:00–09:00 `never-live` with a count of 2.
- Given 09:00 skipped as busy while the 08:00 run is going, when the tick runs, then the check isn't asked about 09:00 and the row stays `busy`.
- Given routine "hourly" with `overlap: allow`, its 08:00 run still going and its target put in the trash since, when 09:00 is due, then the check is asked about 09:00, no run starts and the records get the row `target-unavailable`, `in-trash`, 09:00.
- Given routine "hourly" with `overlap: skip` or `queue`, whose target is in the trash, when one tick finds 08:00, 09:00 and 10:00 due, then the check is asked once, about 08:00, nothing starts, nothing is busy or queued, and the records get one row `target-unavailable`, `in-trash`, with a count of 3.
- Given two routines due at 08:00 and a check that throws for one, then that one's time is reported as failed and the other starts.
- Given a stored row `target-unavailable` without a `why`, or with one that isn't known, then reading the records leaves it out.
