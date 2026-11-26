# Decision: the feedback overlay shows above a modal the app has open

- Approval: the board's report on HAL-10 (26 Nov 13:34 UTC, relayed on Paperclip task HAL-19757) that an open modal sits above the feedback capture overlay, and that the overlay should always be on top of everything, modals included
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vzlhRCEhF5qy8oCSEVAXbRhqo4d+KsVhjc53koo3r5wpl6Yuax6TgPmMtPgG+jclEViHBhgZyGEK+OTRCECWDw==

`feedback.overlay` gains one sentence: while a modal of the app is open in the window where the
feedback shortcut was pressed, the overlay shows above it, and the modal takes no pointer or key
until the overlay is taken away.

Before, the overlay was a fixed `div` at the highest z-index. Studio's modals are the kit's
`<dialog>` opened with `showModal()`, which puts them in the browser's top layer, above any
z-index, so the modal covered the overlay. The overlay is now a modal `<dialog>` of its own: opened
after the app's modal, it is the top of the top layer, and the modal under it is inert until the
overlay closes. Esc still ends the feedback through the overlay's own handler; the browser's own
close on Esc is prevented.

A new test opens a modal, then the overlay, and checks that the overlay is the newest modal in the
top layer, keeps the browser from closing it on Esc, and leaves the top layer when it closes.

## Covers

- feedback.overlay
