# Decision: the Local only refusal says which way it changed and keeps Try again

- Task: HAL-16380 (design check C701 rows 4 and 5, HAL-16371), which takes in HAL-16373 (flow check C700 finding 6)
- Approval: HAL-16380; Liam reviews this pull request and signs this note as the CTO
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3gRGkzIDXcqyQbCGaexCMr4gV1tmN+i0Y7MVcDVamActNfyh0LFAldNZircQ6Es4DwEcxbVl+Q1sppLT7EhTDA==

## What changes

When a save turned Local only on or off while a run was going, Studio refused the next start with
"Local only was turned on or off in Acme, so this run didn't start." and "Try again once the run
that's going ends.", with no **Try again** button. Now:

- A start says "Local only was turned on in Acme while a run was going." ("off" when it was turned
  off) and "Try again once that run ends.", with **Try again** on the Run panel, the run page's
  **Run again** and the Routines page's **Run now**. The refusal is a new shell error,
  `TryAgainLater`, which `startFailureOf` treats as it treats a `conflict`.
- An answer from the Inbox (Approve, Reject, Ask for changes) gives both as one sentence, as the
  lock refusal does, because the Inbox shows only the sentence.
- A routine's tick, refused even with no run going, says "Local only was turned on in Acme." and
  "It starts at its next time."
- "Local" joins the common first words that lose their capital after a colon, so the line reads
  "Couldn't start the run: local only was turned on in Acme while a run was going."

The requirement `studio.engine-service` is updated to say this: its sentence and its two Local
only scenarios take the new words, and a scenario for an answer is added. `shell.start-failure`
adds the `TryAgainLater` case and a scenario for it. The tests that checked the old sentences now
check the new ones exactly (the routine's test checked only the start of the sentence and now
checks the whole sentence and its step); new tests cover the answer's one sentence, the shell's
`TryAgainLater` and the start card's **Try again**. No test was weakened or skipped.

## Why

Design check C701 rows 4 and 5 (HAL-16371) and flow check C700 finding 6 (HAL-16369). The next step
told the person to try again but gave them no button for it. Every screen already leads with
"Couldn't start …", so "so this run didn't start" said it twice, and "on or off" made the person
work out what the saved files now ask for, which the engine knows. A team wording decision on
approved screens (HAL-2282 rule), decided by the designer on HAL-16380.

## Covers

- studio.engine-service
- shell.start-failure
