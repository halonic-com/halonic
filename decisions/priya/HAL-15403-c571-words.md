# Decision: halonic runs drops "about" and points to Models in Studio

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15403
- Kind: user-visible

Words check C571 (HAL-15387, rows 50 and 51) found two things in the last
line of `halonic runs`. "Estimated spend this month: about €0.42" says the
same thing twice, and Studio's Spend tile says "Estimated spend" with no
"about". And "Studio's Settings › Models" points to a page that only has a
summary line and **Open Models**: the Budget block is in the Models section
that **Open Models** opens. The team decided the wording on HAL-15403 (small
wording on an approved line, HAL-2282):

- "Estimated spend this month: €0.42 of your €20.00 budget."
- "Estimated spend this month: €0.42. To cap it, set budget.monthly in
  workspace.yaml, or the monthly budget under Models in Studio."

`cli.commands.runs.month-spend` changes only these words, the sentence that
said "without about", and its Source line. What it counts, the money rule
("€0.00" and "under €0.001" stay as they are) and where the line goes stay
the same. The list tests and the golden file change only for those words;
one test is renamed because it no longer talks about "about", and no
assertion is removed.

## Covers

- cli.commands.runs.month-spend
- apps/cli/src/commands/runs/golden/month-spend.txt
