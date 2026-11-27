# Decision: the phone tab bar's count sits beside the icon (G13 follow-up)

- Approval: HAL-19399 G13, after Noah's house-style check of #6831's follow-up (HAL-20644); a team
  decision on a detail of an approved screen, no board card
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WtSJ6WCKlOrD4/rFtt/hFjnuu03fAwC8o9oy6vr2LC3V4b36sxyhKvrbxHvofBchaVXP8TjoaEYDnpysXOFBCw==

## Covers

- shell.phone-bars
- kit.phone-tab-bar

## What changes

`shell.phone-bars` (active) and `kit.phone-tab-bar` (draft): on a phone, a tab's count now sits
beside its icon, inside the pill, instead of at the icon's corner. The running dot stays at the
icon's corner.

With the Studio's real Inbox icon, the count at the corner hid the tray's right 8px, notch included,
so the icon stopped reading as an inbox. Noah asked for the icon and the count side by side, centred
as a pair in the 56px pill: 6px, icon 20px, ring 2px, count 20px, ring 2px, 6px. Nothing overlaps.
The count's box stays the icon's 20px, which holds one or two digits.

No test is removed or weakened. `phone-bars.test.tsx` now checks the count's new place and the room
the icon keeps for it, instead of its old corner offset.
