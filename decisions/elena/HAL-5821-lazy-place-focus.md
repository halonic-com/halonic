# Decision: focus waits for a place's view that is still loading

- Approval: the maintainer approves this change in review of HAL-5821
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MtDl8B9yyap3HkX26x97TLrr44rbPh26rVv1AOt8n0VjNsNOKyMILjTHQFDvEa5zY6aVddujS87NMalIspBCAQ==

The requirement grows; nothing it promised before is taken away, and no test was weakened.

A move that takes the focus to the new page's `h1` (the sidebar, the toolbar's path, Back and
Forward, a tab switch, the phone's moves) asked for it in the commit right after the move. A
place's view is imported when a tab shows it, so in that commit the page had no `h1` yet and the
focus stayed where it was, every time a place was opened (a11y A3). `focusPageHeading` now waits
for the `h1` when the page has none yet and moves the focus when the view draws it. It stops
waiting when the focus moved somewhere else first, so it never takes the focus back from the
user, and when the next move asks for another page.

Waiting in `focusPageHeading` fixes every caller at once. Keeping one loaded view per place
instead would still miss the first time a place opens.

`shell.studio-window` says so and gains one example.

## Covers

- shell.studio-window
