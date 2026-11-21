# cli.commands.runs.month-spend

- Status: active
- Since: unreleased
- Source: HAL-14778; C480 on HAL-14760 (question 8, row P1), decided by Liam on HAL-14776; the month rule of `app.month-spend`, which the Studio's Spend tile (HAL-8552) and the monthly budget stop share; where to set `budget.monthly` and "Estimated spend", from C544 on HAL-15101, decided by the team on HAL-15121

When `halonic runs` lists at least one run, it shall end with one line that says what the current calendar month (UTC) has spent: "Estimated spend this month: about €0.42 of your €20.00 budget." when the workspace sets `budget.monthly`, else "Estimated spend this month: about €0.42. To cap it, set budget.monthly in workspace.yaml or in Studio's Settings › Models.". The amount shall be the month's spend by the rule of `app.month-spend`, read from the run store as the Studio's Spend tile and the monthly budget stop read it: every real run that started in the month counts, whatever `--status`, `--workflow` and `--limit` show, and test runs never count. Both amounts shall follow the money rule in the workspace's `budget.currency` (EUR when it names none). A month that spent nothing reads "€0.00" and an amount the money rule writes as "under €0.001" stays that way, without "about". The line shall come after the line that says how many runs `--limit` left out. An empty list shall have no such line, and `--json` shall stay as it is.

## Examples

- Given `budget.monthly: 20`, runs this month that cost €0.30 and €0.12, a run in October that cost €5 and a test run this month that cost €9,
  when `halonic runs --limit 1` is run,
  then it prints the newest run, "Showing the newest of 3 runs. See them all with halonic runs --limit 3." and "Estimated spend this month: about €0.42 of your €20.00 budget.".
- Given the same runs and no `budget.monthly`,
  when `halonic runs` is run,
  then its last line is "Estimated spend this month: about €0.42. To cap it, set budget.monthly in workspace.yaml or in Studio's Settings › Models.".
- Given `budget.monthly: 15` and `budget.currency: USD`,
  when `halonic runs` is run,
  then its last line is "Estimated spend this month: about $0.42 of your $15.00 budget.".
- Given runs this month that cost nothing,
  when `halonic runs` is run,
  then its last line is "Estimated spend this month: €0.00. To cap it, set budget.monthly in workspace.yaml or in Studio's Settings › Models.".
- Given only test runs,
  when `halonic runs` is run,
  then it prints "No runs in Acme yet, only test runs. Start one with halonic run <workflow>." and nothing more.
