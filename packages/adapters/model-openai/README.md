# @halonicjs/adapter-model-openai

The model provider for OpenAI's chat completions API and the servers that copy it (Ollama, LM Studio and others): one call goes to `POST {baseUrl}/chat/completions` with native tools.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-model-openai`

## Provider types

A workspace picks the server with a provider's `type`. Each type has a factory; all of them make the same provider and only fill in what the YAML leaves out.

| `type` | Address when `baseUrl` is left out | Key |
| --- | --- | --- |
| `openai` | `https://api.openai.com/v1` | needed; asks for `max_completion_tokens` |
| `openai-compatible` | none, `baseUrl` is required | only when `secret` is set |
| `ollama` | `http://localhost:11434/v1` | only when `secret` is set |
| `lmstudio` | `http://localhost:1234/v1` | only when `secret` is set |

```yaml
# providers/local.yaml
id: local
type: ollama
local: true
```

The key is read from the secret named by `secret` on every call and goes only into the `Authorization` header. A call fails with `no-key`, before anything is sent, when that secret isn't set, or when an `openai` provider names no secret. `openai-compatible`, `ollama` and `lmstudio` at the same address send the same requests.

Ollama cuts every prompt to its context length, 4096 tokens unless the server is started with `OLLAMA_CONTEXT_LENGTH` set higher. The chat completions API can't change it per call, so set it on the server for agents with long instructions or many tools.

```ts
import { openAiFactories } from "@halonicjs/adapter-model-openai";

const factory = openAiFactories.find((each) => each.type === config.type);
const model = factory?.create(config, { secrets, http: { fetch } });
```

## Using the provider directly

```ts
import { OpenAiCompatibleProvider } from "@halonicjs/adapter-model-openai";

const model = new OpenAiCompatibleProvider({
  id: "local",
  type: "ollama",
  baseUrl: "http://localhost:11434/v1",
  http: { fetch },
});
const answer = await model.chat({ model: "qwen3", messages: [{ role: "user", content: "Hi" }] });

for await (const event of model.stream({
  model: "qwen3",
  messages: [{ role: "user", content: "Hi" }],
})) {
  if (event.type === "text") process.stdout.write(event.delta);
}
```

## Options

- `key` gives the API key for one call. Leave it out for servers that need none. The key goes only into the `Authorization` header, never into the body, and no header is sent without a key.
- `maxTokensField` is `max_tokens` unless the vendor wants `max_completion_tokens`. Settings in `params.extra` are added to the request but never replace a field the provider writes, and at most one length field goes out.
- A call never follows a redirect, and the base URL may end in `/` or not.

## Replies

A reply gives the first choice's text, tool calls and usage, plus the reasoning a server sends as `reasoning_content` or `reasoning`. A server that says `stop` on an answer with tool calls still finishes with `tool_calls`. Tool call arguments that aren't a JSON object come back as `{ input: <the text> }`.

## Errors

A failed call throws a `ModelCallError` whose reason says why: `key-refused` (401, and a 403 whose text names no country, region, territory, moderation, flagged content, guardrail or model), `model-missing` (404), `model-no-tools` (the request offered tools and the server says the model doesn't support them), `out-of-credit` (402, or a body whose type or code is `insufficient_quota`, `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded` or `organization_usage_limit_exceeded`, whatever the status), `provider-busy` (any other 429, Groq's 498 and any 5xx), `offline`, which names the host that didn't answer, or `refused` for any other error. The message ends in the HTTP status. The server's own error text is not in it: it goes on the error's `cause`, and the run log keeps it as `providerText` for `--debug` and Copy details. It is dropped when the key is refused, where OpenAI repeats part of the key, when a 401 or 403 repeats a masked key such as `sk-proj-****abcd`, and when it holds the key. A reply over 10 MiB fails with `refused`. An error a server sends as an event in a stream, after it took the call, is `out-of-credit` when its body says so and `refused` otherwise. Its message has no HTTP status, and the server's text on the `cause` has none either, because the status of the call (200) doesn't describe the error.
