# models.spend.month-line

- Status: draft
- Since: 0.1.0
- Source: flow-models 5 (HAL-177), `models.spend.unpriced-never-zero` in req-models (HAL-110)

The Models feature shall add a status bar item that says what this calendar month (UTC) has cost so far, estimated, by the rule the monthly budget stops on (`app.month-spend`): "Est. €3.20 this month", or with a monthly budget "Est. €3.20 of €50.00 this month". Once the month's cost has reached the monthly budget it shall add " · used up". The item shall show only while a provider may bill per use (never when `workspace.yaml` allows local providers only), never as a placeholder, and shall show nothing until the run list has been read, so it never says "€0.00" for a month it hasn't read. A press shall run the command `workspace.open-models`. Its tooltip shall say "Estimated from the prices in workspace settings › Models. Not a provider invoice. Test runs and chats aren't counted." When the focused tab shows a run the run list holds, the item shall put the run first, its cost counting its sub-runs, the way the budget stops a run: "Est. this run €0.15 of €5.00 · €3.35 of €50.00 this month" (without a per-run budget "Est. this run €0.15 · …"). Calls without a price shall be named, "Est. this run €0.10 + 2 calls without a price · …", and a run whose calls all lack a price names no amount, so the line never says "€0.00" for it. Calls made on this computer, a test run in view (the run list holds real runs only) are not part of this item yet. In a narrow window the item shall drop its parts from the right and keep "Est. this run €0.15" (the run's amount, "of €5.00", "+ 2 calls without a price", then the month), and its tooltip shall say the full line before the estimate note.

## Examples

- Given a narrow status bar and a run in view,
  then the parts that no longer fit are cut from the right, "Est. this run €0.15" last,
  and the tooltip says the whole line.

- Given a pay-per-use provider, no budget and runs that cost €3.20 this month,
  when the status bar shows,
  then the item says "Est. €3.20 this month".
- Given a monthly budget of 50 and €3.20 spent,
  then the item says "Est. €3.20 of €50.00 this month".
- Given a monthly budget of 50 and €50.02 spent,
  then the item says "Est. €50.02 of €50.00 this month · used up".
- Given only local providers,
  then the status bar has no spend item.
- Given `privacy.localOnly: true` in `workspace.yaml`,
  then the status bar has no spend item.
- Given the run list has not been read yet,
  then the status bar has no spend item.
- Given a run in view that cost 0.15, a per-run budget of 5 and a month at 3.35 of 50,
  then the item says "Est. this run €0.15 of €5.00 · €3.35 of €50.00 this month".
- Given a run in view with no per-run budget,
  then the item says "Est. this run €0.15 · €3.35 of €50.00 this month".
- Given a run in view that cost 0.10 and has 2 calls without a price,
  then the item says "Est. this run €0.10 + 2 calls without a price · …".
- Given a run in view whose only call has no price,
  then the item says "Est. this run 1 call without a price · …", never "€0.00".
- Given a run in view with a sub-run that cost 0.20 and a run of its own at 0.15,
  then the run part says €0.35.
- Given the focused tab shows Home, or a run the list doesn't hold,
  then the item says the month only.
- Given a run that started in the previous month,
  then its cost is not in the item.
