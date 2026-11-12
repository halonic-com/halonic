# Decision: a failed run's fix sends no one to Studio

- Approval: Liam decided it in his review on HAL-6102 (HAL-6088 row 37), set out as a team decision on HAL-6183, with the wording checked by Sofia on HAL-6260; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oVMETWbwiLHiV98ZQcq3SH1PNxrhTKScEKYTv7ZA3kkHA2K4tTvi0ecM2uRijWD78HPmVbSE4m5M67za6+d3BA==
- Task: HAL-6183

## What changes

Halonic 0.1 has no Studio. HAL-6007 (#1880) already took Studio out of `init`'s `Next:`, the
nothing-live fix and the unknown-workflow hint. Three lines still sent people there: line 2 of a
failed run whose key was refused, whose key is missing, or whose service is signed out.

- `cli.messages`: the fix for a refused key reads "Set HALONIC_SECRET_OPENAI_KEY to a key OpenAI
  accepts, then run again." A missing key reads "Set HALONIC_SECRET_OPENAI_KEY to your OpenAI
  key, then run again." A signed-out service reads "Sign in to Gmail again, then run again.",
  because the CLI has no sign-in command yet.

## Why

A line that points at a Studio the user doesn't have is a dead end. The rule itself doesn't
change: the same reasons, the same two lines, and line 2 still names the one fix. Nothing is
weakened.

## Covers

- cli.messages
