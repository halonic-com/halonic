# inbox.budget-notices

- Status: active
- Since: unreleased
- Source: HAL-11630 (B1 of the UX check, HAL-11613); microcopy 6.5, 10.3; `engine.budget-stops`

When a top-level run of this calendar month (UTC) failed with the reason `budget` and the run budget's error, the Inbox shall list a **Notices** row "*Workflow* stopped at its estimated budget · Reached *limit* per run (estimated *spent*) · *time* ago" with **Open run**, the limit and the spend as the run's own error gave them. When the estimated spend of this month's runs (test runs left out, as in the engine's stop) is at or over the workspace's monthly budget, the Inbox shall list one row "This month's estimated spend reached its budget of *limit*. Runs won't start until *1 of next month* (UTC) or until you change the budget." with **Change budget**, which opens Settings › Models. A run the monthly budget stopped has no row of its own: the month's row says it. The month's row is a new row once the budget changes, so a dismissal of one budget doesn't hide the next. Every row has its ×, and the rows are listed with the other notices, newest first.

When the month's budget is used up, a request from the Inbox shall not start a run: the line under the form shall say "Not started: this month's estimated spend reached its budget of *limit*." followed by **Change budget**, and the message shall stay.

## Examples

- Given a run of "Support replies" that failed with "Run budget reached: 5.08 of 5.00 EUR spent." two hours ago,
  then Notices has "Support replies stopped at its estimated budget · Reached €5.00 per run (estimated €5.08) · 2 hours ago" with **Open run**.
- Given a monthly budget of 50.00 EUR and 50.02 EUR spent by runs that started this month, on 16 Nov,
  then Notices has "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget." with **Change budget**.
- Given 49.99 EUR spent, or 60.00 EUR spent last month, or by test runs,
  then there is no monthly row.
- Given a run the monthly budget stopped,
  then there is no per-run row for it.
- Given the month's budget used up,
  when a request is sent,
  then no run starts, the line says "Not started: this month's estimated spend reached its budget of €50.00." with **Change budget**, and the message is kept.
