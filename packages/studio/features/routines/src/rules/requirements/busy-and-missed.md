# routines.rules.busy-and-missed

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 10); flow-routines 3.7; microcopy 12.3

The routine page shall show the Rules "If the previous run is still busy" (Skip this run, Queue it until the previous one is done, Start anyway) and "Missed while closed or asleep" (Run once to catch up, Run every missed time, Skip missed times), each written at once; a rule that doesn't apply to the trigger shall be left out: Manual only shows no rules, New mail shows only the missed times and a web request shows only the busy rule.

## Examples

- Given a routine on a schedule, then both rules show and picking "Queue it until the previous one is done" writes `queue`.
- Given a routine on New mail, then only "Missed while closed or asleep" shows.
- Given a routine on Manual only, then no rule shows.
