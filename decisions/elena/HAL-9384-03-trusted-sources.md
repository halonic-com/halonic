# Decision: one date wording for trust, and a named loading state for Trusted sources

- Approval: Sofia's design check on HAL-9316 (section B7 and the section C nits on trust); HAL-9384 asks for this on approved microcopy revision 96
- Kind: user-visible
- Task: HAL-9384

## What changes

`workspace.trusted-sources` shows "Trusted on 3 Nov 2026" (as the Trust section does), reads out
"Loading trusted sources" while it loads, and shows `halonic` as code in its note.

## Why

Two wordings for one date, an unnamed loading state, and literal backticks on screen.

## Covers

- workspace.trusted-sources
