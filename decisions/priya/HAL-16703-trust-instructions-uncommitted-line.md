# Decision: trust instructions' line about uncommitted changes reads like trust's

- Task: HAL-16703, from words check C747 on HAL-16694
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16703 (the words are a team decision under the HAL-2282 rule: they repeat the line HAL-16652 decided for `halonic trust`)
- Kind: user-visible

## What changes

Only the dimmed line `halonic trust instructions <agent>` shows when the agent's file or one of its skills' `SKILL.md` has saved changes that aren't committed. It said `These saved changes aren't committed, so runs don't use them and this check doesn't cover them: <files>. Commit them, then run halonic trust instructions <agent> again.`; it now says `Uncommitted changes aren't checked, because runs don't use them: <files>. Commit them, then run halonic trust instructions <agent> again.`, the same words as `halonic trust`'s line since #5348, with its own command at the end. `cli.commands.trust.instructions-run-version` quotes the new line in its rule and its second example, and its changeset names the files with uncommitted changes in the words of `halonic trust`'s changeset. Nothing else it says changes.

The test that checks the line is absent for a saved change to another agent's file looked for "aren't committed", which the new line no longer contains, so it now looks for "Uncommitted changes". It still fails if the line shows up.

## Why

The two commands tell a person the same thing about the same kind of file, so they should say it in the same words. The message's own comment already said it used `halonic trust`'s words; #5348 changed those and left this one behind.

## Covers

- cli.commands.trust.instructions-run-version
