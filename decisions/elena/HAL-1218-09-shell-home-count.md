# Decision: a Home section's count, and opening a place from a view

- Approval: Home's Needs you with its count is part of [HAL-1218](/HAL/issues/HAL-1218); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VxhFvOP12H0+qvdUaZVFc/tP6EHtTCq6GfAWUSlHr2DeV7IvhwViAx1bUvcjnO0kzbbVtm+z5lP1TwS0aaSBCQ==
- Task: HAL-1218

## What changes

`shell.home-sections` gets one sentence: when a card gives a signal, the section's heading shows
its words after the name as a place's count is shown ("Needs you, 1 waiting"), reads it again when
the card says it changed, and shows the name alone at zero.

`shell.studio-window` gets one sentence: the context the window gives a view lets it open one of
the sidebar's places as the sidebar does, in the active tab on the desktop and as the place's list
on a phone.

Nothing else changes in either requirement, and no example was removed or weakened.

## Why

UX checklist part 1, 1.9 (HAL-1323) and ux-checklists-approvals 2.5 want Home's Needs you heading
to read "Needs you, 1 waiting", the same count as the sidebar's Inbox, changing at the same moment.
The shell owns the section headings, so the count has to come through the card, the same way a
place's signal does.

A Needs you row opens its item in the Inbox (1.9, 1.15). A feature can't reach the window's tabs,
so the window gives views a way to open a place; the desktop and the phone each open it the way
their own navigation does.

## Covers

- shell.home-sections
- shell.studio-window
- packages/studio/shell/src/home/home-page.test.tsx
- packages/studio/shell/src/window/studio-window.test.tsx
- packages/studio/shell/src/window/studio-phone.test.tsx
