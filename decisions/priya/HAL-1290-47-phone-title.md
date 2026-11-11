# Decision: on a phone, the window's title names the phone's page

- Approval: the maintainer approves this change in review of HAL-1290 (16d follow-up, the phone page's title)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:rN52On6BUVHs5DC/6LdNa2bo5o2Vte9VPb02me0ZR9s72yePlPJuR8sdxH6IxXmm3aT2tX4gQIJ/oyl+Uu0RAQ==

The requirement widens one promise: the window's title names the page shown, which on a phone is
the phone place's page, not the active tab's. Before, it always named the active tab. No test was
weakened; one example and one test are added for a phone and for a window crossing the phone width.

The phone keeps its own places beside the desktop's tabs (`shell.studio-phone`), so on a phone the
active tab is often not the page on screen. A title naming a page the user can't see would mislead
the browser's tab, the task switcher and screen readers. Sofia's UX check (HAL-5329) asked for the
title to name the page the user is on; this keeps that true on both layouts.

Renames stay a desktop promise. A phone page's title is a copy kept in the phone's places, so a
rename doesn't reach it yet, the same as the phone's top bar. The requirement says so rather than
promise it; renames on the phone are a follow-up.

## Covers

- shell.window-title
