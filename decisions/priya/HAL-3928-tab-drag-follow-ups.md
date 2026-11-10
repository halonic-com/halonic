# Decision: a drag's release doesn't click, and a drag ends without its release

- Requirement: `shell.window-tab-strip` (`packages/studio/shell/requirements/window-tab-strip.md`)
- Task: HAL-3928; Liam's review of #1194 (HAL-1290)
- Approval: Liam asked for these in his review of #1194; he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FgrcDndcRIP3rWF2V5TbOHDO5gq/WEcWJ29YUY9g3mo8Sv678E4L4oCFiy9jhafpRVysts6Ke26DHpgwPjyOCA==

## What changes

`shell.window-tab-strip` said how dragging a tab moves it, but not what the release does after
that, or how a drag ends when its release never comes. It now says three things:

- The click a browser fires after a drag's release does nothing. Before, pressing on a tab's ✕,
  dragging the tab past a neighbour and letting go over the same ✕ closed the tab.
- A pointer move with the main button up ends the drag, for a release the window never saw (let
  go outside a webview that doesn't pass it on). Before, the next hover kept moving the tab.
- The strip going away mid-drag ends the drag, so its window listeners don't outlive it.

One example is added, for the ✕. No example was removed or weakened.

## Why

All three are bugs in how the approved drag behaves, not new behaviour: a drag is a move, not a
click, and a drag that has lost its pointer should stop. Nothing a user sees changes in a drag that
goes as planned.

## Covers

- shell.window-tab-strip
- packages/studio/shell/src/tabs/window-tab-strip.test.tsx
