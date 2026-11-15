# models.spend.month-line

- Status: draft
- Since: 0.1.0
- Source: flow-models 5 (HAL-177), `models.spend.unpriced-never-zero` in req-models (HAL-110)

The Models feature shall add a status bar item that says what this calendar month (UTC) has cost so far, estimated, by the rule the monthly budget stops on (`app.month-spend`): "Est. €3.20 this month", or with a monthly budget "Est. €3.20 of €50.00 this month". Once the month's cost has reached the monthly budget it shall add " · used up". The item shall show only while a provider may bill per use (never when `workspace.yaml` allows local providers only), never as a placeholder, and shall show nothing until the run list has been read, so it never says "€0.00" for a month it hasn't read. A press shall run the command `workspace.open-models`. Its tooltip shall say "Estimated from the prices in workspace settings › Models. Not a provider invoice. Test runs and chats aren't counted." The run in view, per-run budget and calls without a price are not part of this item yet.

## Examples

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
- Given a run that started in the previous month,
  then its cost is not in the item.
