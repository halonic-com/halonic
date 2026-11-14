# Decision: on a phone the Inbox list is the whole page and an open item replaces it

- Approval: the board approved the phone layout frames in HAL-330 (section 5) and HAL-544; Liam approved #2530 in HAL-8784; **Back to Inbox** is a team decision under HAL-2282
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:n4Li4quI+YcmSWQYzgZ9Cb+0+pZIJaXZGP6wVUmVgfyaqCK2vdebRadnJm8Kax8KEyvQNdpQEaIPpP7gunMpBQ==
- Task: HAL-8778

## What changes

`inbox.page` now says what the page does on a phone: the list is the whole page, with its
heading "Inbox" for screen readers only, since the top bar already shows the word. Opening an
item shows its card as a page in place of the list, with **Back to Inbox**, which returns to
the list with focus on the row. An example for the phone is added. No example is removed.

## Why

On a phone the Inbox kept its two-pane desktop layout, so the item pane was clipped and no
item could be opened (HAL-8772). The phone frames in HAL-330 section 5 show the list and the
item as separate pages.

## Covers

- inbox.page
