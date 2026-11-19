# Decision: the kit's Button gets a `danger-outline` variant

- Task: HAL-13105
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13102 (Noah's decision, building on the paired phones design the board approved on HAL-12206, section 2; a team decision with no board card, HAL-2282 rule); Liam signs this note
- Kind: user-visible

## What changes

`kit.button` changes from four variants to five. The new `danger-outline` is `danger` text and a `danger` edge on `surface`, with `danger-soft` as its hover and press fill. It is for a destructive action on a row or under a list that opens a confirm (Revoke, Revoke all); the filled `danger` stays only for the confirming button. No new tokens: every pair already passes AA (contrast table on HAL-13102).

No test was weakened or removed. The edge test and the variant test each gain a `danger-outline` case, and the requirement gains an example for it.

## Covers

- kit.button
