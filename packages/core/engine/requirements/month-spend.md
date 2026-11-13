# engine.month-spend

- Status: active
- Since: 0.1.0
- Source: task HAL-8552 (the Bills tile on Studio Home); month rule of `engine.budget-stops`

When asked for the spend of the last `count` months (six by default), the engine shall list the run store once, from the start of the earliest month, and answer one entry for each calendar month (UTC) up to and including the month of the given time, oldest first. A month's `spent` is the `cost` of every run that started in that month, the same sum the monthly budget stops on, so a call paid for by the person's subscription never counts. A month without runs has `spent` 0.

## Examples

- Given runs that cost 1 EUR and 0.5 EUR in August, 2 EUR on 31 December and 0.25 EUR in January, and a call a subscription paid for in January,
  when the last six months are asked for on 20 January,
  then the answer is August 1.5, September to November 0, December 2 and January 0.25, with one list call.
- Given runs in January that the monthly budget counts as 0.625 EUR,
  when the last month is asked for,
  then its `spent` is 0.625.
