# Decision: `harnessLimits.maxTokens` bounds the tokens of one harness step

- Approval: Paperclip task HAL-17251 (token phase 1b; the board's yes on HAL-16897, direction on HAL-16892); Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vroWfBtAzOOj7np0bVIw3a3g0YwgoSVnnIkXRsbc58GJ9r04jaIj5fGO2HYgbAb2UJ/zXuilPRTC0Sjz1VjeCA==

Token phase 1b adds a token limit to a harness step, next to `maxSteps`, `maxCost` and `maxMinutes`, so a seat's tokens can be bounded where `maxCost` can't: a subscription's calls cost 0.

- `format.agent-harness-limits` gains a fourth field, `maxTokens`, a whole number from 1 to 1000000000. Its example of an unknown field used `maxTokens`; it now uses `maxTurns`, and the test with it.
- `engine.harness-step-limits` adds the tokens of each `llm.response` (input, output, cache read and cache write), a sub-agent's and a subscription call's included, and stops the step at `maxTokens` as it does at `maxCost`, with the cause `harness.max-tokens`. The error follows the template of the other three limits.
- The golden JSON schema of an agent file, `packages/core/format/spec/agent.schema.json`, gains the same field.

## Covers

- format.agent-harness-limits
- engine.harness-step-limits
- packages/core/format/spec/agent.schema.json
