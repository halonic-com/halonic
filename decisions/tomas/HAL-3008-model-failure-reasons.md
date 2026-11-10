# Decision: a refused key, an account out of credit and a busy provider get their own reasons

- Approval: the sentences and fixes for these reasons are board-approved (microcopy 15.3, cli-output 3.4); Liam settled them for v0.1 on HAL-555 and owns `ports`, `events` and `engine`, so he approves this note in review
- Kind: internal
- Task: HAL-3008, from Sofia's words check on HAL-2994

## What changes

`ModelCallErrorReason` gains `key-refused`, `out-of-credit` and `provider-busy`, and
`RunFailureReason` gains the same three, each with its own requirement
(`events.run-failed-key-refused`, `events.run-failed-out-of-credit`,
`events.run-failed-provider-busy`). `runFailureReasonOf` keeps them, and turns `no-key` into
`key-refused` instead of `error` (microcopy 15.3: "No key stored is part of `key-refused`").

Both model adapters write them, from the provider fact sheet on HAL-3058 (read 10 Nov 2026). The
body is checked before the status, because the same status means different things:

- `out-of-credit`, first: 402 in both (DeepSeek, Together, OpenRouter and Mistral send it too).
  OpenAI-compatible: any error whose type or code is `insufficient_quota`,
  `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`
  or `organization_usage_limit_exceeded`. OpenAI sends some of these as codes with another type,
  so type or code counts. Anthropic: a `billing_error`, the 429 whose `error.details.error_code`
  is `enforced_spend_limit_reached` (the tier's spend cap, which would otherwise look busy), and,
  matched loosely, text saying "credit balance is too low" or "reached your specified API usage
  limits" (the 400 for a spend limit the user set).
- `key-refused`: 401, and a 403 whose text doesn't name a country, region, moderation or the model
  (OpenAI's region block, OpenRouter's moderation and guardrails, and Together's plan and model
  limits are 403s that aren't the key). Those 403s stay `refused`, with the vendor's text on
  `cause`.
- `provider-busy`: any other 429, any 5xx, Anthropic's 529 and Groq's 498 (flex tier full).

`refused` stays for everything else, and it still gives `error`. Nothing is renamed or removed.
`llmProviderVersion` stays at 1, as it did when `out-of-memory` was added.

## Why

Today a wrong key, an empty account and a busy provider all leave the adapters as `refused`, which
the engine turns into `error`, so Studio and the CLI say "Halonic can't tell the cause yet" where
the board already approved a clear sentence and a fix. Liam's rule on HAL-2046 is that a reason is
added in the same pull request as the code that writes it; the adapters are that code.

- The three new reasons stop the turn like `refused` did: the model chain still moves on only for
  `no-key` and `offline`, as plan-providers says. Whether a busy provider should fall back is a
  separate question for Liam.
- The messages don't change: "didn't accept the key" for `key-refused`, "refused the call to the
  model" for the rest. Studio and the CLI show the catalogue's sentence for these reasons, so the
  message is only for the run log and `--debug`.
- Errors that arrive mid-stream after an HTTP 200 (Anthropic, OpenRouter) aren't handled yet:
  both adapters ask for a whole reply (`stream: false`). The checks read the parsed body, so a
  stream reader can reuse them when streaming comes.
- Local servers never run out of credit, and a refused connection stays `offline`, none of the
  three. Not yet checked against real replies: Groq's no-credit signal, Ollama cloud, LM Studio,
  and vLLM's key errors. Those fall to the status rules above.
- `model-timeout` stays out until the engine has the 5-minute first-answer timer; nothing writes
  it yet.

No test was weakened. The tests that pinned exactly which reasons exist gain the three, and the
cases that expected `refused` for 401, 403, 429 and 5xx now expect the new reasons.

## Covers

- ports.model-call-error
- events.run-failed-reason
- engine.run-failure-reason-of
- engine.model-failure-stops
- model-anthropic.call-errors
- model-openai.call-errors
- packages/core/ports/src/model-call-error.test.ts
- packages/core/events/src/run-failure.test.ts
- packages/core/engine/src/run/run-failure-reason-of.test.ts
- packages/core/engine/src/agent/model-chain.test.ts
- packages/adapters/model-anthropic/src/anthropic-provider.test.ts
- packages/adapters/model-openai/src/openai-provider.test.ts
