# Decision: the file tree's rows are 32px high, as the new design's tree row

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20990 (Code in the new design, PR 2 of 2; the board picked "Code like chats" on HAL-20742, 28 Nov 2026, with SCREENS.md's tree row). Liam approves the change in review on HAL-20990.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JstDKbJUeuBcdhyUrNCSYgXhSWvXD9JHq7h98jXXm21nTrrSShXQgKkxWRuL+Ty2k5S7M1xXqWUvzXYFI6RtAw==

## What changes

`files.ui.tree-rows` said each row of the file tree is at least 36px high, the top row 8px in. It now says 32px, the top row 13px in, with a 16px box for a folder's chevron, which are the tree row's values in HAL-20742's SCREENS.md (final), "1. Code". A row grows taller only for its name field's message, so a refused name still shows its sentence. The 8px corners, the 10px inside the column, the 16px per level, the one fill for the hovered and the open row and the open file's medium weight stay as they were. The source line names SCREENS.md, and the first example says 32px and 13px.

The test that checked the row's `min-h-9` class and its 8px and 24px indents now checks `min-h-control-md` (32px) and 13px and 29px. It makes the same number of `expect` calls; no test was skipped or removed.

## Why

The board picked Code's design on HAL-20742 with the tree row drawn at 32px, so about twenty rows fit a code folder. The 36px value came from the list row of HAL-20672 at a tree's height, before that design existed.

## Covers

- files.ui.tree-rows
