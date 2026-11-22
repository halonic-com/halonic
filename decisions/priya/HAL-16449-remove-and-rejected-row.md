# Decision: one name for removing a run whose changes are gone, and the ending on a Done row

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16449 (a team decision with no board card, HAL-2282 rule: wording on the approved proposals commands, Inbox and runs list; findings 2 and 3 of Iris's flow check C710 on HAL-16446, and finding 1 of C705 on HAL-16418)
- Kind: user-visible

## What changes

- **Remove from the list (C710 2).** When a run's changes were deleted outside Halonic, Studio
  offers **Remove from Inbox** and says "Removed run 01JD8Q from the Inbox". The CLI said "Remove
  them from the list with halonic proposals reject 01jd8q", where "them" read as the changes, and
  reject then said "Removed run 01jd8q's proposal". Both now name the run, as Studio does: "Remove
  run 01jd8q from the list with halonic proposals reject 01jd8q." and "Removed run 01jd8q from the
  list: its changes were deleted outside Halonic." The command stays `reject`: a new `remove`
  command for one rare case would add a second word for the same action, and the how-to now has a
  row that says `reject` on such a run does what **Remove from Inbox** does.
- **Exit 5, not 9 (C710 2).** `show` and `accept` on such a run exited 9 (`unavailable`), which the
  exit-code table says means something Halonic needs is down and a retry may work. Trying again
  never helps here: the proposal is still listed, but its state doesn't allow showing or accepting
  it, which is `conflict` (exit 5), the code `accept` already uses for a file changed since the run.
- **The ending on a Done row (C705 1, C710 3).** `halonic runs` listed a rejected run as "✓ Done …
  Sent nothing", while `run` and `runs show` say "Ending: Finished without the reply". The row's What
  column now starts with the same "Ending: …" for a workflow with more than one ending, then what
  the run sent and its cost: "Ending: Finished without the reply · sent nothing". The status stays
  "Done", as the run page's badge does. The ending is named only when the run stopped in a final
  state, so a log whose last state isn't final gets no Ending in `runs show` either.

The golden file of the month's spend changes with the row: Acme's test workflow has two final
states, so its Done row now names the ending.

## Covers

- cli.run-ending
- cli.commands.proposals.show
- cli.commands.proposals.decide
- apps/cli/src/commands/runs/golden/month-spend.txt
