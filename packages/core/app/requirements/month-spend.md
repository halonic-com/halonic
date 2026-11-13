# app.month-spend

- Status: active
- Since: 0.1.0
- Source: task HAL-8552 (the Spend tile on Studio Home); month rule of `engine.budget-stops`

The app shall add up run summaries by calendar month (UTC) for the last `count` months up to and including the month of a given time, oldest first. A run belongs to the month of its `startedAt`; a month's `spent` is the sum of its runs' `cost`, the same sum the monthly budget stops on. A month without runs has `spent` 0, and a run outside the months is left out. The engine and the Studio shall both use this rule, so a month's bar and the monthly budget stop always agree.

## Examples

- Given runs that cost 1 and 0.5 in August, 2 at the end of December, 0.25 on 1 January and 9 on 31 July,
  when the last six months are added up on 20 January,
  then the answer is August 1.5, September to November 0, December 2 and January 0.25.
- Given no months are asked for, then the answer is empty.
