# @halonicjs/adapter-model-openai

The model provider for OpenAI's chat completions API and the servers that copy it (Ollama, LM Studio and others): one call goes to `POST {baseUrl}/chat/completions` with native tools.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-model-openai`

## Example

```ts
import { OpenAiCompatibleProvider } from "@halonicjs/adapter-model-openai";

const model = new OpenAiCompatibleProvider({
  id: "local",
  type: "ollama",
  baseUrl: "http://localhost:11434/v1",
  http: { fetch },
});
const answer = await model.chat({ model: "qwen3", messages: [{ role: "user", content: "Hi" }] });
```

A failed call throws a `ModelCallError` whose reason says why: `key-refused` (401, and a 403 whose text names no country, region, territory, moderation, flagging, guardrail or model), `model-missing` (404), `model-no-tools`, `out-of-credit` (402, or a body whose type or code is `insufficient_quota`, `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded` or `organization_usage_limit_exceeded`, whatever the status), `provider-busy` (any other 429 and 5xx), `offline`, which names the host that didn't answer, or `refused` for any other error. The message ends in the HTTP status. The server's own error text is not in it: it goes on the error's `cause`, for `--debug` and Copy details once the run log keeps it ([HAL-3119](/HAL/issues/HAL-3119)), never after 401 or 403, where OpenAI repeats part of the key, and never when it holds the key. A reply over 10 MiB fails with `refused`.
