# Decision: the routines list says "Can't start", as the Studio does, and has `list`

- Approval: HAL-15082; Liam approves this note in review
- Kind: user-visible

## What changes

- `halonic routines` (`cli.commands.routines.list`): the Next column of a routine whose file has
  errors says "✕ Can't start" instead of "✕ Won't start", and the first line says "! 1 routine
  can't start · halonic validate" instead of "! 1 routine has problems · halonic validate".
- `halonic routines --json` gives `nextRun: null` for such a routine, as the list shows no next
  time for it.
- `halonic routines list` lists the same routines as `halonic routines`, instead of "There's no
  command".
- `workspace.routine-start-input` names the new words in its sentence and example.

## Why

The C540 walk (HAL-15074, row 4) found one routine that can't start described four ways: "Can't
start" on the Studio list, "not found" on its page, "isn't in this hub any more" in Run now's toast
and "Won't start" in the CLI. The Studio's "Can't start" stays as the one word; the Studio side is a
separate pull request on the same task. The wording builds on the approved routines list, so it is
a team decision (HAL-2282), not a board question. `list` is an alias because the help says "List
the workspace's routines" and `halonic plugin list` exists.

## Covers

- cli.commands.routines.list
- workspace.routine-start-input
