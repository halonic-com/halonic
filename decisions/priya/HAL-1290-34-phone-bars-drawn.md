# Decision: the phone frame shows the phone's own bars

- Approval: HAL-4671 (Liam's review of #1483); the bars themselves are component specs 15.1 and 15.2 (HAL-175) in the T2 plan (HAL-1290)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vZpLyMDlh9s4w8YMlBZes1ucnrlUOvtqM/KQZgMOWzLStrKD087LpK6q2auDl3knApRJc+RjErEnawYfaDeTBw==
- Task: HAL-1290

## What changes

`shell.frame` changes one sentence and one example. On a phone the frame used to show the page
only. Now it shows the page with the phone's own bars, where it is given them
(`shell.phone-bars`), and still no title bar, toolbar, sidebar or status bar. The example "only
the page shows" now names the desktop bars that stay hidden. Nothing is removed or weakened: the
frame's tests stay as they are, the page still keeps its state when the width crosses
`PHONE_MAX_WIDTH`, and `shell.phone-bars` adds its own tests.

## Why

The old sentence was written while the phone's bars were still to come ("the phone's own bars
come later"). This pull request builds them as the approved specs draw them, so the frame's
requirement has to allow them. What the user sees follows the approved design, so this is an
internal note.

## Covers

- shell.frame
