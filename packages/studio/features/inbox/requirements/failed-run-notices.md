# inbox.failed-run-notices

- Status: active
- Since: 0.1.0
- Source: HAL-1305; HAL-544 `inbox.notices.failed-run`; flow-inbox 2 and 4.3; microcopy 10.1; HAL-11190

When a routine's run fails, the Inbox shall list one notice for that routine for that day, titled "*Routine* failed at 06:00", or "*Routine* failed · 3 times today" when it failed more than once that day, and open the newest of its runs. A notice is a run's `status` `failed` for a run a routine started. A run you started by hand, a Try it or Test run, a run you cancelled, a run that stopped at its budget and a run the sandbox refused (`sandbox-not-ready`) make none: you were there, or the budget stop and the sandbox row (`inbox.sandbox-row`) say it. The title names the routine by its name, and by its workflow's name when the routine is gone, never by its key. A routine run that finished after the failed ones says "Fixed" in its place. A notice names no cause yet, because the run summary doesn't say which model or provider failed, so a cause key is only the routine and the day.

## Examples

- Given "Daily summary" failed at 06:00 today and no run of it finished since,
  then the notice reads "Daily summary failed at 06:00" and opens that run.
- Given "Daily summary" failed at 06:00 and at 06:30 today,
  then there is one notice, "Daily summary failed · 2 times today", and it opens the 06:30 run.
- Given "Daily summary" failed yesterday and today,
  then there are two notices, today's first.
- Given "Daily summary" failed at 06:00 and a run of it finished at 07:00,
  then the notice is fixed.
- Given a run you started by hand that failed, a cancelled run, a budget stop or a Try it run,
  then there is no notice.
- Given "Daily summary" didn't run at 06:00 because the sandbox wasn't ready,
  then there is no notice, and the sandbox row counts it.
