# Decision: the window's reopen at start gives way to the person's opens

- Approval: https://paperclip.ing/HAL/issues/HAL-19958
- Kind: user-visible

Since `studio.window-content` (HAL-19734), Studio reopens at start the workspace its window showed
last, through the same folder opener as Welcome. `workspace.open-folder` and
`workspace.busy-switcher` both say that while a folder opens, other requests to open one are
ignored. Applied to that reopen, the rule was the bug the board hit on HAL-10: while Windows waited
on the engine, Welcome looked idle but dropped every press on **Open folder** and Recent.

`workspace.reopen-gives-way` now says the start's reopen runs beside the person: Welcome shows its
Recent row opening, and the person's opens go ahead. So both sentences are limited to an open the
person asked for, and name that requirement as the exception. Nothing else in them changes, and
their tests stay as they are.

## Covers

- workspace.open-folder
- workspace.busy-switcher
