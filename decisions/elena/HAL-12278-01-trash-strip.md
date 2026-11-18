# Decision: one trash strip for every item page, the Callout look of Files

- Task: HAL-12278
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12278 (Liam's design check on HAL-12234 against the approved microcopy 2, row "Open tab whose item was deleted"; a team decision with no board card, HAL-2282 rule, because it builds on approved screens)
- Kind: user-visible

## What changes

The kit gets `TrashStrip` (new requirement `kit.trash-strip`): the strip an open item page shows
once its item is in the trash. It is the `warning` Callout that a deleted file's tab already shows,
with the text, an optional second line and Undo. With `focusUndo`, Undo takes focus and is
described by the strip's text.

The kit's `Callout` requirement (`kit.callout`) gains one sentence: an action that gives `focus`
takes focus when the Callout appears and is described by the Callout's text. Callouts without it
draw and behave exactly as before.

Library item pages (skill, knowledge source, collection, connector) now draw their strip with
`TrashStrip` instead of plain text with a ghost Undo: same words, same focus on Undo, same
description, now on the warning fill. A deleted file's tab draws exactly as before. The agent page
moves to it once its strip has merged (HAL-12214, #3516).

Nothing is removed or weakened. The library's page test gains a check that the strip is the warning
Callout; the new behaviour has its own tests in `callout.test.tsx` and `trash-strip.test.tsx`.

## Why

Three item pages drew the same message two different ways. The approved microcopy has one strip.

## Covers

- kit.callout
- kit.trash-strip
