# Decision: the "is on" toast and the card ⋮ menu

- Approval: the words are the board-approved microcopy T11 and T15 (HAL-1801); Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-9383

## What changes

`plugins.plugin-review` gains the toast "*name* is on" with "Its command is in Ctrl K and its card is on Home." after **Trust** is saved; the body names only what the plugin adds (command only, card only, or the title alone). `plugins.plugin-cards` gains the card's ⋮ menu: **Open plugin**, and **Hide on Home** where the card is on Home. The app keeps the hidden state; it passes `hide` and uses `usePageActions().toastAddedOff` for "*name* is added but off" when the person presses **Not now** after adding (both with HAL-9373). Nothing was removed or weakened.

## Why

T11 and T15 are approved but were not built, so a person got no word that a plugin was on and could not hide a card.

## Covers

- plugins.plugin-review
- plugins.plugin-cards
