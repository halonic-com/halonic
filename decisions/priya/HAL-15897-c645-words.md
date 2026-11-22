# Decision: C645 words for a refused send and an agent step's missing alias

- Approval: /HAL/issues/HAL-15897 (from the words check C645 on HAL-15886)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zdA8QCRmam3OnDnR1UOe1MLxiwiCqKR7dKHP6LXZ+f/5p84bqOazp3efBxi+bmAPQChLuGQFY/Hb1bKKukISCw==
- Task: HAL-15897

## What changes

Wording on approved screens and in command output, so the team decides it (HAL-2282):

- cli.runs-show-sending-off: "! The call to send_mail was refused: sending is off for mail, so nothing was sent." with the fix on an indented line becomes one line: "! The call to send_mail (mail) wasn't made, because sending is turned off. To switch it on, run halonic google allow-sending mail on." For a connector that isn't a Google one the second sentence is "Halonic can't switch it on for mail yet." The examples follow.
- cli.commands.google.allow-sending and cli.local-engine: the refusal the model gets puts the next step in its own sentence: `Refused: sending is off for the connector "mailbox". To switch it on, run halonic google allow-sending mailbox on.`, and for another connector `… "mailbox". Halonic can't switch it on yet.`
- workflows.start.start-run: the band's line for an agent step's missing alias shows the agent step's name in code style, like the alias: "*Writer*'s agent step `short` uses the model alias `tiny`, …". The Problems row stays plain.
- Three unreleased changesets are reworded (`runs-show-sending-off.md`, `step-model-alias-band.md`, `priya-hal-4295-changed-date.md`).

## Why

- `runs show`: a retried send that sending stopped already says "Didn't work: the call to send_mail (mail) wasn't made, because sending is turned off." (`failed-call-words.ts`). One cause gets one sentence, and the fix sits next to it (E4).
- The refusal: an agent often passes it on to the person as it is, so it has one colon and the next step as its own sentence (E5). "Halonic", since Studio can't switch it on either.
- The band: step names are often ordinary words, so "agent step short uses…" read as if "short" described the step. This was the one change asked for on HAL-15654 (item 1).

## What doesn't change

Which sends are refused, when the line shows, which connectors get the command, and the Problems row's words stay as they are.

## Tests

No test was weakened. `show-refused.test.ts`, `run-sending.test.ts` and `local-run-connectors.test.ts` expect the new words; `problems-band.test.tsx` now checks that both the agent step's name and the alias are in code style.

## Covers

- cli.runs-show-sending-off
- cli.commands.google.allow-sending
- cli.local-engine
- workflows.start.start-run
- apps/cli/src/commands/runs/show-refused.test.ts
- apps/cli/src/run-sending.test.ts
- packages/studio/features/workflows/src/page/problems-band.test.tsx
