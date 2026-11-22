# Decision: on a phone the first run's caption shows in the run card

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16112 (C673 row 8, a team decision on an approved screen, first-run-flow 3.4, HAL-2282); Julian signs it, as Liam wrote the pull request
- Kind: user-visible

`workflows.page.guide-run` said a guide's caption shows as a quiet line under the drawing. On a
phone it now shows as one more quiet line in the docked run card, after the guide's notes, and
not under the drawing. On a desktop nothing changes, and the rest of the requirement is
unchanged.

## Why

On a phone the docked run card covers the page, and the caption was drawn only with the run strip,
so it never showed there (visual check C673, row 8). The first run shows the caption once, so a
phone user who started it never read what the boxes on the drawing are.

## Covers

- workflows.page.guide-run
