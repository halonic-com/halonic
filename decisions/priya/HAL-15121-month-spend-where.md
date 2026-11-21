# Decision: halonic runs says where budget.monthly goes

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15121
- Kind: user-visible

Iris's flow check C544 (HAL-15101) found that the last line of
`halonic runs`, "This month: €0.00. Set budget.monthly to cap it.", doesn't
say where to set it, and that it doesn't call the amount an estimate as
Studio does. The team decided the wording on HAL-15121 (small wording on an
approved line):

- "Estimated spend this month: about €0.42 of your €20.00 budget."
- "Estimated spend this month: about €0.42. To cap it, set budget.monthly in
  workspace.yaml or in Studio's Settings › Models."

`cli.commands.runs.month-spend` changes only these words and its Source
line; what it counts, the money rule and where the line goes stay as they
are. The list tests and the golden file change only for those words, and no
assertion is removed.

## Covers

- cli.commands.runs.month-spend
- apps/cli/src/commands/runs/golden/month-spend.txt
