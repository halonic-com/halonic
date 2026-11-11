# Decision: the kit's List can show a current row

- Approval: Liam asked for the Inbox page on [HAL-1218](/HAL/issues/HAL-1218); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Mxy3VAeSvAk6bjNnvY+L24kxKI/9W30JM/KR2Gb17JUmQlAwAn2HcE1Ehlq0pk6SpbEfLH6gX3rl/QXFx2JsCw==
- Task: HAL-1218

## What changes

`kit.list` gets one sentence: the row named by the list's `current` has the selected look and
`aria-current="true"`, and still opens on Enter or a click. Only its look changes: being current
doesn't select it, so with a `selection` its `aria-selected` and checkbox follow the selection. Nothing else in the requirement changes, and no example was removed or weakened.

## Why

The Inbox page shows the open item's card beside its list, and the open row has to look open
(UX checklist 2.1 and 2.10). The list's `selection` is for picking several rows with checkboxes,
which the Inbox doesn't do, so a list that opens one row at a time gets its own prop.

## Covers

- kit.list
- packages/studio/kit/src/list/list-current.test.tsx
