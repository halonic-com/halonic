# Decision: `halonic routines` shows which routines the watch runs, and the watch says when one is fixed

- Approval: Paperclip task HAL-15664 (from Sofia's C610 #1–3 on HAL-15653), decided by the team under HAL-2282; Liam approves this note in his review of this pull request on HAL-15664
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Y0OQPCdZlQSJloSQrqZ7EMksCXogZxyWiyx4gmFIzTePDMBkRwscLmtMmjBfvtdVFmgW2wU71CiL3TBC9mn4Cg==
- Task: HAL-15664

## What changes

`cli.commands.routines.list` changes four sentences; the details sit in the unreleased
`cli.commands.routines.list-live-version`:

- The Next column says "Not live yet" for a routine that is on but no commit has, in a
  workspace with history. A line under the list says "! Hourly ping isn't live yet, so it
  doesn't run. Commit it to start it.", the words of the Studio's routine page.
- A routine whose saved changes aren't live yet now gets "Can't start" and exit 1 only when the
  live version's file has errors, since that is what the watch starts. When only the saved file
  has errors, the row shows the live version and the line under the list says "! Minute ping
  has changes that aren't live yet, and they have errors (halonic validate). It runs as last
  committed."
- `--json` gives each routine two more fields: `liveState` (`live`, `not-live`, `never-live`) and
  `savedProblems`. `problems` counts the errors of the version that runs.

`cli.commands.routines.watch` (unreleased) prints "✓ Friday digest can start now" on the tick after
a routine that couldn't start has its file fixed.

`app.routine-list-live-schedule` (unreleased), the core routine list under both, counts a routine's
errors from its live version, counts its saved file's errors apart, gives a never-live routine no
next run, and says whether each routine is live, not live yet or never live.

## Why

In C610 the list showed "Next 02:00" for a routine never committed, which the watch left out, and
"Can't start" with exit 1 for a routine the watch started every minute from its last commit. Both
rows promised the opposite of what happened. The list now follows the scheduler (`LiveRoutines`),
as #4708 did for a valid saved change.

- "Not live yet" and the line reuse the Studio's "This routine isn't live yet, so it doesn't run."
  rather than new words.
- A routine that is off, or has errors, gets no "isn't live yet" line: committing it wouldn't
  start it, and its row already says Off or Can't start.
- Exiting 0 when only saved changes have errors keeps the exit code's meaning: every routine can
  start. `halonic validate` still exits 1 for the saved file.

## Tests

No test was weakened or removed. HAL-15204's `list-not-live` test now commits the workflow its
routine starts as well, since a live version without it can't start the routine; its expected
lines are unchanged. The golden files and one `--json` test gain the two new fields. The new tests
fail without the fix.

## Covers

- cli.commands.routines.list
- cli.commands.routines.list-live-version
- cli.commands.routines.watch
- app.routine-list-live-schedule
- apps/cli/src/commands/routines/golden/acme-routines.txt
- apps/cli/src/commands/routines/golden/acme-routines-two-hubs.txt
