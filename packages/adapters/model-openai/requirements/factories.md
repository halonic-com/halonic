# model-openai.factories

- Status: active
- Since: 0.1.0
- Source: HAL-2284; one OpenAI-compatible adapter with `ollama` and `lmstudio` as presets (HAL-230, from HAL-1448); the `LlmProviderFactory` port v1

The adapter shall have a factory for each of the provider types `openai`, `openai-compatible`, `ollama` and `lmstudio`. A type shall only fill in what the provider's YAML leaves out: `openai` the address `https://api.openai.com/v1` and the length field `max_completion_tokens`, `ollama` the address `http://localhost:11434/v1` and `lmstudio` the address `http://localhost:1234/v1`. A provider of type `openai-compatible` without a `baseUrl` shall be refused with an error that names the provider, and so shall a `secret` that isn't a valid secret name. With a `secret`, the provider shall read the key for every call and send it only in the `Authorization` header. A call shall fail with `no-key`, before anything is sent, when that secret isn't set, and for an `openai` provider that names no secret. Providers of type `openai-compatible`, `ollama` and `lmstudio` at the same address shall send the same requests.

## Examples

- Given `{ id: "local", type: "ollama" }`,
  when a call is sent,
  then it goes to `http://localhost:11434/v1/chat/completions` without an `Authorization` header.
- Given `{ id: "openai", type: "openai", secret: "openai-key" }` and no secret "openai-key",
  when a call is made,
  then it fails with `no-key` and the server receives nothing.
- Given `{ id: "box", type: "lmstudio", baseUrl: "http://box.test:1234/v1" }`,
  when a call is sent,
  then it goes to `http://box.test:1234/v1/chat/completions`.
