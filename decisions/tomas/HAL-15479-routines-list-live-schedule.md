# Decision: `halonic routines` shows a routine that isn't live yet as the watch runs it

- Approval: Paperclip tasks HAL-15479 (from C581 on HAL-15468) and HAL-15513 (from Nina's C585 G1 on HAL-15496), decided by the team under HAL-2282; Liam approves this note in his review of this pull request on HAL-15479
- Kind: user-visible
- Task: HAL-15479

## What changes

`cli.commands.routines.list` gains one sentence. For a routine whose saved file differs from the
live version (the routine that already gets the "! … has changes that aren't live yet" line under
the list), the trigger and Next columns, and `--json`'s `nextRun` and `timeZone`, show the live
version, the one `halonic routines watch` and the Studio start. Its name and whether it is on still
come from the saved file. Every other routine is listed from its saved file, as before. The
sentence points to the new requirement `cli.commands.routines.list-live-version`, which holds the
details. The Source line names HAL-15513 (C585 G1).

No other sentence of the requirement changes.

## Why

Before, a Monday routine saved as Sundays but not committed was listed as "Sundays at 09:00
Next tomorrow 09:00", while the watch would start it on Monday. The row promised a run that
wouldn't happen, and the CLI disagreed with the Studio, whose summary and Next follow the live
version since #4602 (flow-routines 3.11).

- On or Off comes from the saved file because the scheduler (`LiveRoutines`) applies Off at
  once, without a commit.
- Nina's other option, keeping the saved time and saying in the line which time is live, was not
  taken: the row would still show a time the routine doesn't run at.
- It adds no new words: the columns keep their wording, only which version fills them changes.

## Tests

No test was weakened or removed. One expected row in HAL-15204's test (`list-not-live`) now shows
the live schedule ("Daily at 08:00") instead of the saved one ("Daily at 07:00"), with the same
number of checks; that row is the case this changes. The new CLI test fails without the fix.

## Covers

- cli.commands.routines.list
