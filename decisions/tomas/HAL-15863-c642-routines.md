# Decision: a routine whose fix isn't committed says so, and "commit" names Studio's Make live

- Approval: Paperclip task HAL-15863 (from flow check C642 #2 and #7 on HAL-15857; #5 landed with HAL-15751), decided by the team under HAL-2282; Liam approves this note in his review of this pull request on HAL-15863
- Kind: user-visible
- Task: HAL-15863

## What changes

`cli.commands.routines.list-live-version` (unreleased): when a routine's live version has errors
and its saved file has none, the fix is saved but not committed. The list counts it on its own
first line, "! 1 routine can't start until its fix is committed", not under "· halonic validate",
and the line under the list says "! Weekly report's fix isn't live yet, so it can't start. To
start it, commit the fix or make it live in Halonic Studio." instead of "It runs as last committed
until you commit them.". The row still says "✕ Can't start" and the list still exits 1.

`cli.commands.routines.watch` (unreleased): for the same routine the watch says "✕ Weekly report
can't start until its fix is committed or made live in Halonic Studio" instead of "… until its file
is fixed · halonic validate".

`cli.commands.routines.list` and `list-live-version`: the lines that ask for a commit name Studio's
Make live as a second way, joined with "or": "… until you commit them or make them live in Halonic
Studio." and "To start it, commit it or make it live in Halonic Studio.".

## Why

- C642 #2: the list and the watch sent the reader to `halonic validate`, which reads the saved
  file, finds nothing and exits 0. The watch runs the last commit, so the step that helps is the
  commit. The line under the list also said the routine runs as last committed, but the last
  commit is the version that can't start.
- C642 #7: the CLI said "commit", Studio says "Make live", "Make live and run" and "Review and make
  live", and nothing linked the two. In a terminal the commit is the real step, and Sofia's
  HAL-6041 note says the CLI names Studio's make-live step once one exists. It now does, joined to the
  commit with "or" so the reader sees that either one works, and as "Halonic Studio" in full since
  plain "Studio" is unclear in a terminal (HAL-15504). The fix line says "commit the fix", since
  "it" could mean the routine. Small wording on an approved screen, so the team decided it
  (HAL-2282): Sofia chose these words on HAL-15877.

## Tests

No test was weakened or removed. Tests that quote the changed lines now quote the new words. A new
list test and a new watch test commit a routine with a typo, fix the saved file without a commit
and check the new lines; both fail without the fix.

## Covers

- cli.commands.routines.list
- cli.commands.routines.list-live-version
- cli.commands.routines.watch
