# Decision: one date wording for trust, and a named loading state for Trusted sources

- Approval: Sofia's design check on HAL-9316 (section B7 and the section C nits on trust); HAL-9384 asks for this on approved microcopy revision 96
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4y8WHOK+DnqUd4Na8b5VF63HA2xqa8F3exEEu2RrTQAR6HC5oqsEHIPgKerYX8EuMskX7F5N+CjpzsPrKbMOAw==
- Task: HAL-9384

## What changes

`workspace.trusted-sources` shows "Trusted on 3 Nov 2026" (as the Trust section does), reads out
"Loading trusted sources" while it loads, and shows `halonic` as code in its note.

## Why

Two wordings for one date, an unnamed loading state, and literal backticks on screen.

## Covers

- workspace.trusted-sources
