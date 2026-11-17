# Decision: a deleted file's tab says so, and the missing-file words are the approved ones

- Task: HAL-11381
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11370 (design check item F1 against the approved files flow 8.8 and microcopy 7; a team decision with no board card, HAL-2282 rule, because it builds on the approved screens)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:G+WRWxEzyaqMECSWGGhA1ShJpywo+KKYtcYfTQFBO5Xb5fS4EmgTyTiB8SgVDrNlEba1mnzpWOKDgTrTw0nIDQ==

## What changes

The requirement `files.ui.delete-file` now names the full path in the toasts ("Moved *full path* to
the trash", "Couldn't move *full path* to the trash", "Couldn't put *full path* back"), because two
hubs can hold the same file name. An open tab of the deleted file keeps its text greyed and
read-only at once under the strip "This file was moved to the trash" with **Undo** (said once to a
screen reader, taking no focus), and never writes the file again. When Undo can no longer bring the
file back, the tab says the file isn't in this workspace any more. Focus in the tree goes to the next row, else the previous one, else the folder, and
after Undo to the restored row.

The requirement `files.ui.file-tab` now says "This file isn't in this workspace any more." with
**Go to Files** for a missing file; the old line "This file isn't here any more" and its second
sentence are replaced.

Nothing existing is removed or weakened beyond those words. Two tests change their expected text
(the toast's path, the missing-file words); tests for the strip, Undo, the focus and Go to Files
are added.

## Why

Before, the tab of a deleted file kept a live editor, and the next keystroke re-created the file.
The approved design asks for the strip and the exact words, and for focus not to fall to the page.

## Covers

- files.ui.delete-file
- files.ui.file-tab
