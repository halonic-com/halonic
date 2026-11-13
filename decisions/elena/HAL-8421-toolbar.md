# Decision: the toolbar row goes, its parts move into the title bar and the status bar

- Approval: Timothy (board) approved this on HAL-8416 ("Yes, all"); Noah's spec is on HAL-8433
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:U0fB90Dm8Y0CJsa6rtja/zMckm6yolG8/48fgwgyUN74NPslczXHkqS3vrQ5LV7PqhxVdsp6Y6FE8L5v2j6WAg==
- Task: HAL-8421

## What changes

The toolbar row above the page is removed. Its parts move:

- Back and Forward sit in the title bar, after the Halonic mark and "Halonic Studio" at the far left. Under 900px the words go and the mark stays, named "Halonic Studio".
- The Places button (narrow windows only) is the first thing in the title bar.
- "Saved" is at the right end of the status bar, and the header badges slot is at its left.
- The path ("Workflows / Support reply") is dropped, as Noah decided.

`shell.toolbar` becomes `shell.title-bar`. The other shell requirements named below only change where they say the toolbar held a part.

## Why

The board asked for one less row above the page, with Back and Forward next to the name at top left and "Saved" in the bottom bar. The other tests that name these requirements still assert the same behaviour in the new places. The tests for the path were removed with the path. Back and Forward are now tested in `title-bar/history-buttons.test.tsx`, and the save note in `frame/status-bar-save-note.test.tsx`. One assertion in the workspace window test stopped saying the words "Halonic Studio" are absent, because the title bar now always shows them.

## Covers

- shell.cut-text-tooltips
- shell.engine-line
- shell.frame
- shell.places-drawer
- shell.save-note
- shell.save-state
- shell.studio-phone
- shell.studio-window
- shell.title-bar
- shell.toolbar
- packages/studio/shell/src/cut-text/cut-text-tooltips.test.tsx
- packages/studio/shell/src/toolbar/toolbar-save-note.test.tsx
- packages/studio/shell/src/toolbar/toolbar.test.tsx
