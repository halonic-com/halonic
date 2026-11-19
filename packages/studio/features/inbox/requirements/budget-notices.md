# inbox.budget-notices

- Status: active
- Since: unreleased
- Source: HAL-11630 (B1 of the UX check, HAL-11613); HAL-10915 (B2 and B4 of the UX acceptance rows, HAL-12735); flow-inbox 4.1, 4.3; microcopy 6.5, 10.3; `engine.budget-stops`

When a top-level run of this calendar month (UTC) failed with the reason `budget` and the run budget stopped it, the Inbox shall list a **Notices** row "*Workflow* stopped at its estimated budget · Reached *limit* per run (estimated *spent*) · *time* ago" with **Open run**. The limit, the spend and the currency come from the run's typed cause (`budget.run`, `engine.budget-stops`); a run logged before the cause gives them in its error ("Run budget reached: 5.08 of 5.00 EUR spent."). When neither says them, the row names no amount: "*Workflow* stopped at its estimated budget · *time* ago". The row never shows the engine's error text. When the estimated spend of this month's runs (test runs left out, as in the engine's stop) is at or over the workspace's monthly budget, the Inbox shall list one row "This month's estimated spend reached its budget of *limit*. Runs won't start until *1 of next month* (UTC) or until you change the budget." with **Change budget**, which opens Workspace settings at its Budget block (`workspace.open-budget`) in the same tab. A run the monthly budget stopped has no row of its own: the month's row says it. The month's row is a new row once the budget changes, so a dismissal of one budget doesn't hide the next. A per-run row has its ×. The month's row has no ×, and **Delete** doesn't dismiss it: while it is true no run starts, so it can't be hidden. It is listed first, above every other notice; the other rows follow, newest first.

When the month's budget is used up, a request from the Inbox shall not start a run: the line under the form shall say "Not started: this month's estimated spend reached its budget of *limit*." followed by **Change budget**, and the message shall stay.

## Examples

- Given a run of "Support replies" that failed with "Run budget reached: 5.08 of 5.00 EUR spent." two hours ago,
  then Notices has "Support replies stopped at its estimated budget · Reached €5.00 per run (estimated €5.08) · 2 hours ago" with **Open run**.
- Given a run that failed with "Run budget reached: 0.0004 of 0.0003 EUR spent.",
  then the row reads "…· Reached its budget of less than €0.001 per run (estimated less than €0.001) · …", and a monthly budget that tiny reads "…reached its budget of less than €0.001.", never "of under".
- Given a monthly budget of 50.00 EUR and 50.02 EUR spent by runs that started this month, on 16 Nov,
  then Notices has "This month's estimated spend reached its budget of €50.00. Runs won't start until 1 December (UTC) or until you change the budget." with **Change budget**.
- Given 49.99 EUR spent, or 60.00 EUR spent last month, or by test runs,
  then there is no monthly row.
- Given a run whose cause is `budget.run` with the limit "0.01", the spend "0.36" and the currency "EUR",
  then the row reads "…· Reached €0.01 per run (estimated €0.36) · …", whatever its error says.
- Given a run stopped at its run budget whose cause and error say no amount,
  then the row reads "Support replies stopped at its estimated budget · 2 hours ago".
- Given a run the monthly budget stopped (cause `budget.month`, or the error "Monthly budget reached: …"),
  then there is no per-run row for it.
- Given the month's row and a failed-run notice newer than it,
  then the month's row is listed first, it has no ×, and **Delete** on it dismisses nothing.
- Given the month's budget used up,
  when a request is sent,
  then no run starts, the line says "Not started: this month's estimated spend reached its budget of €50.00." with **Change budget**, and the message is kept.
