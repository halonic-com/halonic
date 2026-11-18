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

## Covers

- ports.sandbox-check-reason
