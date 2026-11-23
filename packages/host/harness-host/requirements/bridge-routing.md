# harness-host.bridge-routing

- Status: active
- Since: unreleased
- Source: HAL-16834 (PR 1 of the OpenCode harness plan, HAL-16826: the bridge sets OpenRouter's host pin from the alias, never from the request, which also pins Claude Code steps on OpenRouter)

When `ProviderKeyServices` gives a harness agent's bridge a key of the provider its model alias names, and that alias sets `params.extra.provider`, the access shall carry it as `routing`, which the bridge sends (requirement `harness-bridge.openrouter-routing`), and no other key of `params.extra`. An alias that sets no `params.extra.provider`, an agent whose `model` is no alias, a key that isn't the alias's own provider's, and the program's own sign-in shall get no `routing`. The models file has already checked the pin's keys and their types (requirement `format.models-provider-routing`).

## Examples

- Given the keyed provider `openrouter` at `https://openrouter.ai/api` and the alias `pinned` of it with `params: { extra: { provider: { order: [deepinfra/fp8], allow_fallbacks: false, data_collection: deny }, top_k: 40 } }`,
  when the bridge's services of an agent whose `model` is `pinned` are asked for,
  then its access has `routing: { order: ["deepinfra/fp8"], allow_fallbacks: false, data_collection: "deny" }` and nothing of `top_k`.
- Given an alias of the same provider without `params.extra.provider`,
  when its agent's bridge services are asked for,
  then its access has no `routing`.
- Given the alias `pinned`, when the app's alias rules give it no keyed provider,
  then its access has no `routing`.
