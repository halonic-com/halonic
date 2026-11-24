# Decision: `routines watch` names the signal a run started on, and shows a refused loop

- Approval: Paperclip task HAL-14305, on the plan Liam approved there (20 Nov), the G5 and G6 answers on that task, and Julian's condition 2 on HAL-14332; the reviewer approves this note in review
- Kind: internal

## What changes

`cli.commands.routines.watch` described only the finished line with the due time. Now that the
scheduler starts routines on signals (#5551), the requirement also says:

- a run a signal started prints the signal's name and the time it was sent, where a timed run
  prints its due time: "✓ Started On paid · run <id> · signal paid 09:02";
- a start the loop guard refuses prints a dim line that names the routine and the signal and says
  how to stop the loop.

Two examples are added, one for each line. Every other sentence, example and test stays.

## Covers

- cli.commands.routines.watch
