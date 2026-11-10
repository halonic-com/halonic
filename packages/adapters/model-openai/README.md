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

## Options

- `key` gives the API key for one call. Leave it out for servers that need none. The key goes only into the `Authorization` header, never into the body, and no header is sent without a key.
- `maxTokensField` is `max_tokens` unless the vendor wants `max_completion_tokens`. Settings in `params.extra` are added to the request but never replace a field the provider writes, and at most one length field goes out.
- A call never follows a redirect, and the base URL may end in `/` or not.

## Replies

A reply gives the first choice's text, tool calls and usage, plus the reasoning a server sends as `reasoning_content` or `reasoning`. A server that says `stop` on an answer with tool calls still finishes with `tool_calls`. Tool call arguments that aren't a JSON object come back as `{ input: <the text> }`.

## Errors

A failed call throws a `ModelCallError` whose reason says why: `key-refused` (401, and a 403 whose text names no country, region, territory, moderation, flagged content, guardrail or model), `model-missing` (404), `model-no-tools` (the request offered tools and the server says the model doesn't support them), `out-of-credit` (402, or a body whose type or code is `insufficient_quota`, `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded` or `organization_usage_limit_exceeded`, whatever the status), `provider-busy` (any other 429, Groq's 498 and any 5xx), `offline`, which names the host that didn't answer, or `refused` for any other error. The message ends in the HTTP status. The server's own error text is not in it: it goes on the error's `cause`, and the run log keeps it as `providerText` for `--debug` and Copy details. It is dropped when the key is refused, where OpenAI repeats part of the key, when a 401 or 403 repeats a masked key such as `sk-proj-****abcd`, and when it holds the key. A reply over 10 MiB fails with `refused`.
