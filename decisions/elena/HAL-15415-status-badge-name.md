# Decision: the phone's status badge takes the strings table's name

- Task: HAL-15415
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15415 (Noah's design check C569 on HAL-15385 asks for it); the reviewer signs this note
- Kind: internal

## What changes

`kit.header-badge-status` gains an optional `name`: when it is given, it is the badge's name as given, instead of its words, a full stop and its action. A new example: the label "Reconnecting…" with the name "Reconnecting. Details" is named "Reconnecting. Details".

## Why

`phoneStatusLabel` (#4520) returns the strings table's name for each state ("Connected to Tim's laptop. Details", "Reconnecting. Details"), but the badge built its own from its words, so a screen reader would hear "Connected, Tim's laptop. Details" and "Reconnecting…. Details". With `name`, as `Button` has, the status screen passes `label.name`. Nothing uses the phone label yet, so no screen changes now.

## Covers

- kit.header-badge-status
- packages/studio/kit/src/header-badge/header-badge-status.test.tsx
