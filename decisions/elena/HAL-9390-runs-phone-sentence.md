# Decision: the phone's Runs list and run page show one sentence for now

- Approval: the 0.1.0 phone scope is Liam's call on HAL-9390 (the phone layout comes after 0.1.0); one plain sentence is wording that builds on the approved Runs screens, a team decision with no board card (HAL-2282 rule); the CTO signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+mxL6yVM1TEcjGSrYbGYbWm8IfU5d78bpghRhYYXI8qtyp9BduTmbPwsYQ7bkrnr+Ra4Jzm0JC9V/1PYrUXODA==
- Task: HAL-9390

## What changes

`runs.list` gets one paragraph: on a phone, the Runs list shows only the sentence "Runs open on your computer for now.", and the phone layout comes after 0.1.0.

`runs.run-page` gets the same paragraph for the run page.

Both pages use one shared `RunsOnComputer` component and the wording lives in `run-words.ts`. Nothing else changes in these requirements, and no example was removed or weakened.

## Why

The Runs list and the run page have no phone layout yet. Showing the desktop page squeezed onto a phone would be broken, so the phone says plainly that runs open on the computer, until the phone layout is built after 0.1.0.

## Covers

- runs.list
- runs.run-page
- packages/studio/features/runs/src/ui/runs-on-computer.test.tsx
