# Decision: an agent routine meets "can't run an agent on its own" before the sandbox

- Task: HAL-14848
- Approval: Sofia asked for this UX fix on HAL-14848 (https://paperclip.halonic.com/HAL/issues/HAL-14848) and on HAL-12367, as a team decision with no board card (HAL-2282 rule). Liam signs this note at code review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5+eN1/BThveqSoX7dcOWWbnNG6RIAv1eR9rr+tvA9LQbbEnZe6DoQOT7mNDFgjWYNFDXbjQrpIjPZEGdJXePBw==

## What changes

A routine that starts an agent on its own now counts as starting no program, whatever the agent's
harness. Before, an agent in Claude Code or Codex counted as one, so on a computer where the
sandbox can't start the routine page showed the sandbox Callout and made **Run now** unavailable.
Now the page checks nothing for such a routine, shows no Callout, and **Run now** gives the reason
it already gives on `main` (HAL-14647): "Halonic can't run an agent on its own yet, only as a step
in a workflow."

A routine that starts a workflow still counts as starting a program when one of the workflow's
agents runs in Claude Code or Codex, so it keeps the sandbox Callout.

The requirements `routines.page.cant-run` and `studio.workspace-routines` say this, each with an
example. In `workspace-routines.test.ts` the agent-in-Codex case now expects `false` instead of
`true`; the workflow case still expects `true`. A page test is added for an agent routine on a
computer where the sandbox can't start. No test was weakened or skipped.

## Why

Found in Sofia's UX check of the Run now fix (HAL-12367): the person fixed the sandbox only to be
told the routine can't run anyway. That is the dead end C471-2 removed. The Starts card already
says an agent can't run on its own, so the page and the card now say the same thing.

## Covers

- routines.page.cant-run
- studio.workspace-routines
- apps/studio/src/routines/workspace-routines.test.ts
- packages/studio/features/routines/src/page/cant-run.test.tsx
