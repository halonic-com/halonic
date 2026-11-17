# Decision: a tab tells its page how often a step was asked for

- Task: HAL-11379
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11379 (Liam approved the shape in his comment of 17 Nov: an optional `asked` on `TabLocation`, as a separate small PR)
- Kind: internal

`TabLocation` (public in `studio-shell`) gets an optional `asked` count. `TabSet.openHere` bumps it every
time a step is asked for on the place a tab shows, also when the tab is on that step already, and
`openItem` hands it to the page. A page that is open can then tell it was asked again, for example the
workflow page going back to Configuration's Tests on a second **Run its tests**. The count is not part of
the place's key, the equality check, or saved and restored tabs, and `moveToStep` no longer returns early
when only the count changed. Other features are not affected: the field is optional.

The requirement `shell.tab-set` says so in one added sentence and one example. No rule was removed and no
test was weakened.

## Covers

- shell.tab-set
