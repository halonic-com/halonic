# Decision: a busy provider moves on to the next model

- Approval: the board chose B on HAL-3118 (the question from HAL-3116): a busy provider falls back to the next model. Liam owns `engine`, so he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:libLbj1e4za09+Gumgffi/Gs4zOV/zBCBpr1waPJGRsxE73UOubQ3SmsrmZP+jbmUpw2s4jb5a/VuKA7SaybAQ==
- Task: HAL-3178

## What changes

The model chain now moves on for `provider-busy` as well as `no-key` and `offline`. A call whose
provider is busy (any 429 that isn't about credit, any 5xx, Anthropic's 529, Groq's 498) goes to
the next model of the turn at once, with no wait and no retry. The switch is in the run log as
`llm.fallback`, with the busy error, as for an offline model. When every model is busy, the turn
fails with `provider-busy`, and so does the run. When the chain mixes causes, the turn fails with
the last model's cause, as before.

The new requirement `engine.busy-falls-back` says this. `engine.model-failure-stops` no longer
lists a busy provider, and its test for busy moves to the new requirement, so it runs one test
fewer. `engine.offline-falls-back` says `provider-busy` can be the last cause too, and its example
for an all-offline run says `model-unreachable`, which is what the engine has given since HAL-2085
(the text still said `error`).

## Why

The board decided it on HAL-3118. A busy provider is nothing the person set, and another model
can usually answer, so stopping the turn only makes them wait and run it again.

`out-of-credit` and `key-refused` still stop the turn (team decision, on the task): the person has
to fix the key or the account, and moving on would hide that and could move their spending to
another provider without them choosing it.

No retry is added: the chain still never calls the same model twice in a turn.

## Covers

- engine.model-failure-stops
- engine.offline-falls-back
