# Decision: a held-back Undo replaces its toast with one that says why and keeps Undo

- Approval: Paperclip task HAL-16661 (design check C741 on HAL-16649, row 1); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:F9JIeVlBsppL6ycXOVwYYTAhGGO6sMnCvyNb2LvQkjNnasFJMwOSo2B8L79ogh/WjII4uFVYjdefqtaeCCW7Cg==

While the engine isn't answering, **Undo** on a run proposal's decision toast sends nothing. Until now the decision toast stayed and a second toast, "Couldn't undo this." with its line, said why. On a desktop both show, one above the other. On a phone the kit shows one toast at a time, oldest first, and the decision toast stays until it's closed (its Undo keeps it open, and focus on Undo pauses its timer), so the reason waited behind it: the person pressed **Undo** and saw nothing happen. The signed-out line, "Sign in again to send your answer.", is mostly seen on a phone (the served Studio), so it was hidden the same way.

- `inbox.proposal-undo-held` now says the toast is **replaced** by the danger toast "Couldn't undo this.", which keeps **Undo** and says why ("The engine isn't answering. Press Undo again once it answers." or the signed-out line), instead of keeping the toast and showing a second one. The lines themselves don't change.
- A danger toast stays until it's closed, so **Undo** is still there once the engine answers, and one decision never has two toasts on screen. Pressing **Undo** again while the engine still isn't answering replaces the toast once more, so the reason is announced again.
- No kit change: the phone's one-at-a-time order stays as it is for every toast. The alternative, a kit `update(id, message)` to turn the decision toast itself into the danger one, needs a new store call for one screen.

## Covers

- inbox.proposal-undo-held
