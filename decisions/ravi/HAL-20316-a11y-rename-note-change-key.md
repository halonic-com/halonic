# Decision: a screen reader hears the rename note once

- Approval: HAL-20316 (team decision under HAL-2282; Liam signs on review)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:uQ5ioJpbVkUn53edrc22vsHqKxeZ0ku4m4hf6X9XbcWOjvwVoclM2ZQ+/6a0JoD0bXbT+8eVbcd334J4yfVUCw==

The rename note ("Also updates 2 places: …") appears under a name field that already has focus,
and a screen reader doesn't read a description again when it changes under focus, so the user
never heard it before the new name was kept (WCAG 4.1.3, a11y check on HAL-20312). The
requirement said the note shall not be announced, to avoid reading it for every letter. It now
says the note is announced politely once when it first shows in an edit, and again only when its
words change; the first example says it is announced once, and a new example pins that the next
letter doesn't read it again. Team decision under HAL-2282, set on HAL-20316.

## Covers

- shell.item-page-name-note
