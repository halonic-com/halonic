# Decision: `llm.request` also keeps the effort the program itself sent

- Task: HAL-17262
- Approval: Liam decided this follow-up on HAL-17250 (#5580); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0sswDBnCtdCLyrtaDNDmehrFmJA3/4fXCgIPsW6fGahfo++CbAAkcO07GEfUJBBCU13Bj03JbWKeRQvHngKHBQ==

## What changes

Requirement `events.llm-request-effort` gets a second paragraph and one more example: an
`llm.request` may also keep, in an optional `programEffort`, the effort the program itself sent
(Anthropic `output_config.effort`, OpenAI `reasoning.effort`), one of `none`, `minimal`, `low`,
`medium`, `high`, `xhigh` or `max`. The first paragraph, about the `effort` the bridge sets, and
its examples are unchanged. The field is optional, so older logs read as before.

The new requirement `harness-bridge.program-effort` says when the Node bridge records it. Its
tests are new; no test is weakened, skipped or removed. The `llm.request` type moves from
`run-event.ts` to `llm-request.ts` unchanged apart from the new field, because `run-event.ts`
was already over the 480-line growth limit.

## Why

The run log showed only the effort the bridge set, so a run of a pinned harness without an
effort in the agent's files said nothing about how hard the program asked the model to think.
That is the number the token work on HAL-16355 needs per call.

## Covers

- events.llm-request-effort
