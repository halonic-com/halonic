# Decision: on a narrow card, ← names where it goes instead of a cut-off path

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14711 (decided by Sofia with Noah on HAL-14707, after Noah's C462 on HAL-14703: a detail of the approved flow-agents 7 screen, HAL-2282)
- Kind: user-visible

At 390px a stacked card's header row held ←, the whole path and ✕, so every part of the path was
cut ("Acme M… › Writ… › draft-re…") and the last part repeated the title under it. Where the card
is narrower than 30rem, ← and the breadcrumb now give way to one ← with the name of the level it
goes back to ("← Writer", named "Back to Writer"), and the title wraps instead of being cut. The
title keeps its name with the whole path, so a screen reader still hears where it is. A container
query on the card decides, so a narrow panel on the desktop gets it too. From 30rem up nothing
changes.

`shell.stacked-cards` gains that sentence and a narrow example. No test was weakened: the existing
tests run as before, two jsdom tests check what the named ← says and does, and a new e2e test
checks which header shows at a phone's width and a desktop's in Chromium and WebKit.

## Covers

- shell.stacked-cards
