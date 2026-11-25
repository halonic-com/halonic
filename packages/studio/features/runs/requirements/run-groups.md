# runs.run-groups

- Status: active
- Since: unreleased
- Source: HAL-18624 (Runs app build), design revision 3 on HAL-18594 (Runs: flows, the groups and the summary line), approved by the board on 25 Nov 14:48 UTC; task HAL-18725

The Runs app's list shall group runs from every source, most urgent first: **Needs you** for runs waiting for the user, **Failed** for failed runs the user hasn't opened and that no later successful run of the same workflow or task has followed, **Running** for queued and running runs, then one group per day for every other run, headed **Earlier today**, **Yesterday**, then the date, with the year when it isn't this year. Each group shall list its runs newest first, and an empty group shall not be shown. A stopped run, whether a person, a budget or the source stopped it, shall go to its day and never to Failed. Days shall start at local midnight in the user's time zone, as the Costs view's do. The summary line shall count the runs that started today, how many of them failed, and their cost with one total per currency, and the heading shall count the runs running now. The current time, the time zone and the opened runs shall be inputs.

## Examples

- Given a failed run of Nightly report the user hasn't opened,
  when the list is grouped,
  then it is under Failed; once opened, it is under its day.
- Given a failed run of Nightly report and a later run of it that succeeded,
  when the list is grouped,
  then the failed run is under its day, not under Failed.
- Given a run stopped by its budget,
  when the list is grouped,
  then it is under its day.
- Given runs today costing €0.04 and €0.07 and $0.10,
  when the summary is made,
  then it holds €0.11 and $0.10 apart.
