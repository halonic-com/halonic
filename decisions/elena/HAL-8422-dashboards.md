# Decision: small capitals labels use the one `text-label` style

- Approval: the board's design decisions of 13 Nov on HAL-8416 (Noah's spec for one label style: uppercase, 12/16, weight 600, 0.04em); the package owner (Liam) approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0HATBc6qKrWTMP9Q6LtfddpJFeilVPzihRBhWp6vBbradxPDMWjQ60u3yeH1aw2jDpMRSslpLOv2ZwtVyLfUDw==
- Task: HAL-8422

## What changes

`kit.list-heading`, `kit.menu-groups` and `shell.item-page-header` named the small capitals label
as `text-caption` plus `tracking-label`. They now name the one `text-label` style, which holds the
size, line height, weight and letter spacing in one place. `tracking-label` is gone. Each label
stays in capitals and keeps its colour. No example was removed or weakened.

## Why

The board picked one label style for Studio and the website. With one style, a label can't get the
caption size without the label spacing, and a change to the label look is made once.

## Covers

- kit.list-heading
- kit.menu-groups
- shell.item-page-header
