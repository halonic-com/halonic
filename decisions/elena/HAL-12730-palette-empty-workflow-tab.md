# Decision: Ctrl K says "Nothing matches" only when no action matches either

- Task: HAL-12730
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12721 (Liam's fix list from the first-run check, L12; the wording was confirmed there)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:j3OuRdb+Vl/gexj6Ziogm/tdRv/dkb0c9pBaSArego0awZeodICuqUH5tu/T8CzPFY9IfguztwcAEOVSHUjiDQ==

## What changes

Typing `New` in Ctrl K, or in the phone's Search sheet, showed "Nothing matches “New”." above four
actions that match. The line now shows only when no place, item or action matches. "Couldn't
search" is unchanged: it still shows above matching actions, since a provider failing is news
either way.

The requirements `shell.palette-groups`, `shell.palette-dialog` and `shell.phone-search` say
"no place, item or action" where they said "no place or item". Their tests that expected the line
above matching actions now expect no line there, and each keeps a test that the line shows when
nothing matches at all. No test was weakened or skipped.

The fixture in `gone-item-tabs.test.tsx` now names its panel tabs "Weather" and "Translate", as the
test opens them, because the window now names an item's tab again when its kind says the items
changed (`shell.item-tab-names`, new, for L14).

## Why

The first-run check (HAL-12714, F17) read the line as a mistake: it said nothing matched right above
what did.

## Covers

- shell.palette-groups
- shell.palette-dialog
- shell.phone-search
- packages/studio/shell/src/palette/palette-groups.test.ts
- packages/studio/shell/src/palette/command-palette.test.tsx
- packages/studio/shell/src/palette/shell-phone-search.test.tsx
- packages/studio/shell/src/window/gone-item-tabs.test.tsx
