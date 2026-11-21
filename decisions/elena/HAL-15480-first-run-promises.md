# Decision: Help › First run keeps its promises, from words check C584

- Task: HAL-15480
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15471#document-c584 (rows 4, 6 and 7; small fixes to an approved screen that make its behaviour match the board's words in C520-9, so a team decision with no board card, HAL-2282 rule)
- Kind: user-visible

## What changes

Three active requirements are edited; the words the board approved in the Help menu stay as they are:

- `first-run.help`: **Show the guide** takes a first run that was paused or dismissed in the demo up again at its step, so "where you left off" holds after **Dismiss** on the Inbox's setup item too (row 4). After a finished first run it still begins at Demo. **Start over** shows only in the demo, as **Show the guide** does, so "Your old copy stays where it is." never shows in someone's own workspace (row 6). The example for a folder that isn't the demo now says "also in a window with Open demo", and a new example covers a dismissed first run.
- `workspace.try-sample` and `workspace.fresh-copy-asks`: the toast after **Start over** and **Fresh copy of the demo** says "Created Acme sample 2. Your old copy is still in Recent.", the same "old copy" the menu just used (row 7).

The tests that pinned the old toast words are updated to the new ones. New tests cover a dismissed first run taken up again at its step, a dismissed state saved before the step was kept, and no First run items outside the demo. No test was weakened or skipped.

## Why

Words check C584 on HAL-15471 found that the Help menu promised more than it did: after **Dismiss**, **Show the guide** started again at Demo, because the dismissed state kept only the folder; **Start over** showed in every window with **Open demo**, where "Your old copy" has nothing to refer to and "Start over" reads as if the user's own work would be reset; and the toast called the same copy "earlier copy" a second after the menu said "old copy".

## Covers

- first-run.help
- workspace.try-sample
- workspace.fresh-copy-asks
