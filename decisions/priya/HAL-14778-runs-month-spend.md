# Decision: halonic runs ends with this month's spend

- Approval: HAL-14776
- Kind: user-visible

`halonic runs` now ends with one line for the current calendar month, such
as "This month: about €0.42 of your €20.00 budget.", so a CLI user can see
how much of `budget.monthly` the month has used (C480 on HAL-14760, row P1;
decided by Liam on HAL-14776). The new requirement is
`cli.commands.runs.month-spend`.

`cli.commands.runs.list` said the list "shall end with" the line about runs
`--limit` left out. That line still comes after the rows, but the month line
now comes last, so the sentence says "add" and points to the new
requirement. Nothing else in it changes.

The existing list tests change only for that line: a list that prints full
output now expects "This month: €0.00. Set budget.monthly to cap it." at the
end, the cut-off line is read one line up, and a list of one run has two
lines. No assertion is removed.

## Covers

- apps/cli/src/commands/runs/requirements/list.md
- apps/cli/src/commands/runs/list.test.ts
- cli.commands.runs.list
- apps/cli/src/commands/runs/golden/month-spend.txt
