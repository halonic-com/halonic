# Decision: trust's line about uncommitted changes leads with what the check means

- Task: HAL-16652, with row 7 of words check C739 bundled from HAL-16657
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16657 (the words are a team decision from the words check under the HAL-2282 rule)
- Kind: user-visible

## What changes

Only the dimmed line `halonic trust` shows when a definition file or a file under `integrations/` has saved changes that aren't committed. It said `These saved changes aren't committed, so runs don't use them and this check doesn't cover them: <files>. Commit them, then run halonic trust again.`; it now says `Uncommitted changes aren't checked, because runs don't use them: <files>. Commit them, then run halonic trust again.` `cli.commands.trust.run-version` quotes the new line in its rule and its second example. Nothing else it says changes.

The test that checks the line is absent when everything is committed looked for "aren't committed", which the new line no longer contains, so it now looks for "Uncommitted changes". It still fails if the line shows up.

## Why

"These saved changes" pointed at a list of files that came only after two other ideas. The new line leads with what it means for this check, and says "uncommitted changes" as `halonic run`'s line does.

## Covers

- cli.commands.trust.run-version
