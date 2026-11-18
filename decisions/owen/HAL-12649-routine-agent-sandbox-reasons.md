# Decision: a new sandbox reason code for a backend the app doesn't offer

- Approval: Paperclip task HAL-12649, from the team decision on HAL-12643 (C52 item 8); Liam signs this note in review on HAL-12649
- Kind: user-visible

The `Sandbox` port's closed list of reasons gains `not-offered`, just before
`other`, and the port goes to version 8
(docs/adr/2026-11-18-sandbox-reason-not-offered.md). Studio's "on this
computer" backend returns it, so the run page says "Halonic can't run Claude
Code or Codex agents outside the sandbox yet." with the fix "Save a change to
this agent's file, which puts it back in the sandbox.", instead of "Halonic
can't tell what the sandbox is missing.". The requirement's list of codes and its examples gain the new code;
nothing is removed.

The five tests of the reason list moved, unchanged, from
`port-shapes.test.ts` to the new `sandbox-check-reason.test.ts`, which also
gains a test for `not-offered`; this keeps `port-shapes.test.ts` under the
500-line limit. No test was dropped, so `port-shapes.test.ts` runs 43 tests
instead of 48, and the drop is listed under Covers.

## Covers

- ports.sandbox-check-reason
- packages/core/ports/src/port-shapes.test.ts
