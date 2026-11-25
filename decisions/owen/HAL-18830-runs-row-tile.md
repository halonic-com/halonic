# Decision: a Runs app row leads with a tile and its state's corner dot, not a status chip

- Task: HAL-18830 (from the visual check on HAL-18821)
- Approval: the row is design revision 3 on HAL-18594, section 1 "A running run" and the "Visual pass" tables, approved by the board on 25 Nov 14:48 UTC; the requirement's first text described the chip the first build used instead
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6MGn1qb9+EfDUdvBIT73qZq/nnpJDepyvxO5Qod+0lm3ciVI7cfKtQAVTIZwbQ7nEVKwv2Np4+zQgEDKlVkDCg==

## What changes

`runs.app-list` said each row shows the run's status chip. The chip sat in the List's 20px icon
slot and ran under the title. The requirement now says what the approved design draws: a 28px
tile (the agent's avatar or a workflow tile) with an 8px corner dot in the state's colour, the
state's word in the row's screen-reader label, and three lines: what ran with the time, the run's
line, and where it runs with the cost under the time. The Needs you and Failed headings take their
tones. The rest of the requirement is unchanged.

Tests: `runs-app-list.test.tsx` replaces its "ends each row with its cost" check with checks of
the tile and its dot, the time and the cost, and the heading tones; every amount it checked is
still checked. `runs-app-view.test.tsx` checked "Finished · Acme Ops" as one meta line; the line
and where it runs are now two lines, so it checks the two side by side.

`runs.app-sources` still names each state's chip word: that word is now the one the row's label
says.

## Why

The approved row; the chip overlapped the title in every row and "Needs you" wrapped onto two
lines (HAL-18821).

## Covers

- runs.app-list
