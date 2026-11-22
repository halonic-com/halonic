# Decision: `halonic secret remove` says when nothing was saved

- Task: HAL-15641
- Approval: flow check C605, point 6c (https://paperclip.halonic.com/HAL/issues/HAL-15625), routed to the platform adapters' owner in https://paperclip.halonic.com/HAL/issues/HAL-15641. A team decision on a command's wording, with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

`halonic secret remove notes-token` printed "✓ Removed notes-token." and exited 0 when no secret
was saved under that name, so a typo or the wrong store looked like a removal. It now prints
"notes-token wasn't set. Nothing changed." and still exits 0, so a second run still finishes what a
first left undone; `--json` says `"removed": false`.

`SecretService.remove` checks the store's names (never a value) and answers
`{ changed: false, notSaved: true }` without touching the store when none matches.

The requirement `cli.commands.secret.remove` replaces "also when no such secret is saved" and its
example with this line, and `app.secret-service` gains the sentence and an example. The two tests
that expected a removal of nothing now expect the new answer and also check the store is unchanged.
No test was weakened or skipped.

## Why

In C605, `halonic secret remove notes-token` said "✓ Removed notes-token." for a secret that was
never saved (HAL-15625). "Removed" should only stand for a removal.

## Covers

- cli.commands.secret.remove
- app.secret-service
