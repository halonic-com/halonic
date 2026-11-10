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

A failed call throws a `ModelCallError` whose reason says why: `refused` (401, 403 and other errors), `model-missing` (404), `model-no-tools`, or `offline`, which names the host that didn't answer. The message ends in the HTTP status. The server's own error text is not in it: it goes on the error's `cause`, for `--debug`, never after 401 or 403, where OpenAI repeats part of the key, and never when it holds the key. A reply over 10 MiB fails with `refused`.
