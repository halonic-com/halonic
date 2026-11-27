# Decision: drop the retired paths from the HAL-20716 note's Covers list

- Task: HAL-20718
- Approval: Liam signs this note for HAL-20718 (board rule: no reference app names in the code base), as agreed on HAL-20716. Fast-track.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3xRYZdAY9JH2VhxlYYGMye6t4Wfttzg2GAhg7aI3qRgBV5lRqBpizwRevsBYnGLtoRrGVexrxbOaj2TfjeKPBg==

## What changes

The HAL-20716 decision note loses the three Covers lines that named files and a requirement retired
by that change; they spelled out the reference app's name. The note's decision and its other Covers
lines stay as they are. A comment in the shell's `rail.ts` now describes the layout in our own words.
No requirement, check or behaviour changes.

## Why

The board's rule: our code bases never name the app the design was modelled on.

## Covers

- decisions/owen/HAL-20716-neutral-theme-names.md
