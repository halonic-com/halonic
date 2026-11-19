# harness-bridge.provider-base-url

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505); HAL-403 (Claude Code and Codex may use any provider that speaks the same API); HAL-12473

When the agent reaches Anthropic or OpenAI with a key whose access names a `baseUrl`, the Node bridge shall send that agent's `POST /v1/messages` to the `baseUrl` with `/v1/messages` added (a `baseUrl` that ends in `/v1` doesn't get it twice), and its `POST /v1/responses` to the `baseUrl` with `/responses` added, with the program's query, under every other rule of `harness-bridge.anthropic`, `harness-bridge.openai`, `harness-bridge.pass-through` and `harness-bridge.spend`, and it shall send them only the request fields and the tools it knows (`harness-bridge.compatible-request`). It shall read the `baseUrl` only from the access the host gave, never from the program's request or headers. The agent's key shall go only to the origin (scheme, host and port) of that `baseUrl`, never to the API's own host or any other, and a redirect shall end the call. Those calls shall go through the server's `compatibleFetch`; when the server has none, the bridge shall refuse them with the kind `denied`, without reading the key or calling any provider. An access without a `baseUrl`, and a sign-in access, shall go to the API's own host through the server's `fetch`, as before, and never through `compatibleFetch`. When a keyed access names a `providerId`, the bridge shall name it as the `provider` of the call's `llm.request` and `llm.response`, so the run log shows the provider file the call went to; otherwise the API's own name. When the `baseUrl` isn't an `https` address or an `http` one whose host is `localhost`, in `127.0.0.0/8` or `::1`, or holds a user name, a password, a query or a fragment, the bridge shall refuse the request with the kind `invalid_input` without reading the key or calling any provider, and its error shall name neither the address nor the key.

## Examples

- Given an agent with a key and the `baseUrl` `https://api.z.ai/api/anthropic`,
  when Claude Code sends `POST /v1/messages?beta=true`,
  then the bridge calls `https://api.z.ai/api/anthropic/v1/messages?beta=true` through `compatibleFetch` with the agent's key as `x-api-key`, and nothing through `fetch`.
- Given an agent with a key and the `baseUrl` `https://compatible.example/v1/`,
  when Claude Code sends a request,
  then the bridge calls `https://compatible.example/v1/messages`.
- Given an agent with a key and the `baseUrl` `http://localhost:11434`,
  when Claude Code sends a request,
  then the bridge calls `http://localhost:11434/v1/messages`.
- Given an agent with a key and the `baseUrl` `http://compatible.example/anthropic`,
  when Claude Code sends a request,
  then it gets a 400 that names neither the address nor the key, and no provider is called.
- Given an agent with a key and a `baseUrl`, on a server without `compatibleFetch`,
  when Claude Code sends a request,
  then it gets a 403, the key isn't read, and no provider is called.
- Given an agent with a key and a `baseUrl`,
  when the program addresses its request to another host, in its `Host` header or an absolute target,
  then it gets a 421, the key isn't read, and no provider is called.
- Given an agent with a key and no `baseUrl`, or one on a subscription,
  when Claude Code sends a request,
  then the bridge calls `https://api.anthropic.com/v1/messages` through `fetch`, and nothing through `compatibleFetch`.
- Given an agent with a key and the `baseUrl` `https://openrouter.example/api/v1`,
  when Codex sends `POST /v1/responses`,
  then the bridge calls `https://openrouter.example/api/v1/responses` with the agent's key as the bearer.
- Given an agent whose priced model is served at a `baseUrl`,
  when the reply ends with its usage,
  then the call is recorded with the same cost as at the API's own host.
- Given an agent with a key whose access names the `providerId` `openrouter`,
  when Codex's call is recorded,
  then its `llm.request` and `llm.response` name `openrouter` as the provider.
