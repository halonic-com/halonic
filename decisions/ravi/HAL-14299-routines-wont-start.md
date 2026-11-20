# Decision: the routines list, watch and serve say when a routine won't start

- Approval: HAL-14299; Liam approves this note in review
- Kind: user-visible

## What changes

- `halonic routines` (`cli.commands.routines.list`): a routine whose file has errors shows
  "✕ Won't start" in its Next column, a first line counts them ("! 1 routine has problems ·
  halonic validate"), and the list exits 1 instead of 0. A file that doesn't load now shows
  "✕ Won't start" instead of "Off". A schedule that names a time zone other than this
  computer's has its next run written in that zone, with the zone after it: "Next 13 Nov 16:00
  (Europe/Amsterdam)". `--json` gives each routine's `timeZone` and `problems` too.
- The routine list (`app.routine-list`) gives each routine those two fields: the errors on its
  file, as the workspace's checks find them, and the zone its schedule names.
- `halonic routines watch` (`cli.commands.routines.watch`): under "Watching N routines", one line
  for each webhook routine that is on: "Friday digest starts on a web request: run halonic serve
  for it."
- `halonic serve` (`cli.commands.serve.serve`): after its start lines, one line per webhook
  routine that is on, with its address, and a ✕ line when its secret has no value: "✕ Friday
  digest won't start: its secret friday-hook isn't set. Set it with: halonic secret set
  friday-hook".
- A routine `trigger` that is none of the kinds, such as two at once or `manual: false`
  (`format.routine-file`), fails with "trigger needs exactly one of: schedule, every, manual:
  true, signal, mail or webhook." instead of "Invalid input". The code stays `invalid_union`,
  and a mistake inside one kind, such as `every: 15`, keeps its own message.

## Why

The C340 check (HAL-14271, rows 13, 14 and 32, code rows C32–C34) found a broken routine listed
as normal with exit 0, a `Next` time in the computer's zone next to the routine's own zone, a
watch that says "Watching 0 routines" with a webhook routine present, a `serve` that says nothing
about its webhook routines or their missing secret, and "Invalid input" with no field for a
trigger of two kinds. The wording is Nina's, in the form of the approved C336/C337 messages
("what is wrong" and "what to do"), so it is a team decision (Liam, HAL-14299), not a board
question. Tomas's plain schema messages (HAL-14277, C19) have no union helper yet; this message
sits on the trigger's union only, so his helper can take it over.

The engine lock's message (C46) is a separate pull request on the same task: naming the command
that holds the lock needs the lock file to record it.

## Covers

- cli.commands.routines.list
- cli.commands.routines.watch
- cli.commands.serve.serve
- app.routine-list
- format.routine-file
