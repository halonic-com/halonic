# harness-bridge.openrouter-routing

- Status: active
- Since: unreleased
- Source: HAL-16834 (PR 1 of the OpenCode harness plan, HAL-16826, approved by Liam with four conditions: OpenRouter's host only, only its routing keys, checked as the models file loads, the bridge's pin replaces the request's while a program's own is still refused, and the pin shows in `llm.request`; it also pins Claude Code steps on OpenRouter, which ran on any host before)

When the agent's keyed access to a provider names a `routing` and its `baseUrl` host is exactly `openrouter.ai`, the Node bridge shall send the provider every `POST /v1/messages` and `POST /v1/responses` of that agent with that routing as the request's `provider` field, holding only OpenRouter's routing keys `order`, `only`, `ignore`, `allow_fallbacks`, `data_collection`, `zdr` and `quantizations`, in place of whatever the request held. It shall record that routing as the `routing` of the call's `llm.request`.

A request of the program's own with a `provider` field shall still be refused with a 403, before any provider is called (requirement `harness-bridge.compatible-request`), so the program never chooses the hosts. For any other `baseUrl` host (another host, a subdomain, a look-alike or another port), for an access without a `routing`, and for the program's own sign-in, the bridge shall send no `provider`, and the `llm.request` shall have no `routing`. The routing comes only from the host (requirement `harness-host.bridge-routing`), never from the request.

## Examples

- Given a keyed access at `https://openrouter.ai/api` with `routing: { order: ["deepinfra/fp8"], allow_fallbacks: false, data_collection: "deny" }`,
  when Claude Code sends a request for its model,
  then OpenRouter gets the request with that `provider`, and the `llm.request` has the same `routing`.
- Given a keyed access at `https://openrouter.ai/api/v1` with the same routing,
  when Codex or OpenCode sends a Responses request,
  then OpenRouter gets it with that `provider` too.
- Given the same access,
  when the program sends a request with a `provider` of its own,
  then the bridge answers 403 and calls no provider.
- Given a keyed access with a routing at `https://eu.openrouter.ai/api`, `https://openrouter.ai.acme.example/api` or `https://openrouter.ai:8443/api`,
  when the program sends a request,
  then the provider gets no `provider`, and the `llm.request` has no `routing`.
- Given a routing that also holds `sort`,
  when the program sends a request,
  then the provider's `provider` holds only the routing keys.
