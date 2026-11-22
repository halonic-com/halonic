# Decision: a refusal names a fix that isn't live yet, and a watch with no routine that can start says to leave it running

- Approval: Liam approves this change on HAL-16057 (https://paperclip.halonic.com/HAL/issues/HAL-16057), from Iris's flow check C666 (#2 and #5) on HAL-16045. The words build on the ones the team approved for `halonic routines` in C642 #2 (HAL-15863), as HAL-2282 allows for a small wording on approved output
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:iSKOy89akb8AQ9x9qBDyyS/x3VpTrWrNPZ+dnIhv+B1TbZT128a3jg+PdVcOO9TVhUWV9lJ0+eNuMEhbH62pBw==

## What changes

`halonic run`, `halonic runs send` and `halonic routines watch` read the live version, the last
commit, and `halonic validate` reads the saved files. When a file's error is in the last commit and
its fix is saved but not committed, a run said "✕ Couldn't run support-reply: Acme has 1 problem in
models.yaml. Nothing ran." with "See it with: halonic validate", and `validate` then said "No
problems." #4926 fixed this for a routine's own file only; Iris found it again for `models.yaml`
and a provider file.

- `cli.workspace-file-problems`: when the live version has errors that stop the run, the refusal
  now also reads the saved files with the same rule. When they have none of those errors, line 1
  says "Acme's last commit has 1 problem in models.yaml, and its fix isn't live yet. Nothing ran."
  ("2 problems …, and their fixes aren't live yet.") and line 2 "Commit the fix or make it live in
  Halonic Studio, then try again." ("Commit the fixes or make them live …"). The kind, the exit
  code (2) and the `--json` code `workspace-file-problems` don't change. Saved files that still
  have an error, or that can't be read, keep the line that points to `halonic validate`. The saved
  files are read only when the live version has such an error, so a run that starts reads nothing
  more.
- `cli.commands.routines.watch`: when every routine on a clock is left out because it can't start,
  each with its ✕ line, the first line now says "Watching 0 routines in Acme for now. Once a
  routine above can start, the watch starts it on time, so leave this running. Stop with Ctrl C."
  where it said only "Watching 0 routines in Acme. Stop with Ctrl C." The ✕ lines above already say
  what to fix; this line says what happens then, since the watch picks up a new live version by
  itself.
- Studio's routine row (`routines.list.rows-and-states`, not active): a mail trigger whose
  connector isn't a Google one now reads "mail isn't a Google connector, so it has no mailbox to
  watch. Pick another mailbox under When.", where it said "inbox" and then "mailbox". The When card
  labels the field Mailbox.

`halonic serve` prints no such refusal: it starts, and a run it starts goes through the app
service, so it has no line to change here.

## Tests

No test is removed or weakened. New: `run` with a committed `models.yaml` error and the saved file
fixed (the new lines) and still broken another way (`validate`'s line), through real git. Changed:
the watch test whose only routine can't start expects the new first line, and the Studio row test
the new word. The existing refusal tests, with no history or with the saved files broken, still
expect `validate`'s line.

## Why

A refusal shouldn't send the person to a command that finds nothing. `halonic routines` already
says a routine's fix "isn't live yet" and to "commit the fix or make it live in Halonic Studio", so
the run says it the same way. Keeping the kind and exit code means scripts that read them see no
change.

## Covers

- cli.workspace-file-problems
- cli.commands.routines.watch
