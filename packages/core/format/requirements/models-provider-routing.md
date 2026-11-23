# format.models-provider-routing

- Status: active
- Since: unreleased
- Source: HAL-16834 (PR 1 of the OpenCode harness plan, HAL-16826; Liam's condition 2: an alias whose host pin breaks the rules fails when the models file loads, not on the first call)

When `parseFile` reads a model alias, in `models.yaml` or a hub's `hub.yaml`, whose `params.extra` has the key `provider`, the format shall accept it only as OpenRouter's routing field: a map with only the keys `order`, `only`, `ignore` and `quantizations`, each a list of text, `allow_fallbacks` and `zdr`, each true or false, and `data_collection`, `allow` or `deny`. Any other key, or a value of another type, shall fail at that path, so the file doesn't load. The other keys of `params.extra` stay as they were, passed through untouched.

## Examples

- Given an alias with `params: { extra: { provider: { order: [deepinfra/fp8], allow_fallbacks: false, data_collection: deny }, top_k: 40 } }`,
  when it is parsed,
  then it keeps the routing and `top_k` as written.
- Given an alias whose `params.extra.provider` has the key `sort`,
  when it is parsed,
  then it fails with `unrecognized_keys` at `aliases.<name>.params.extra.provider`.
- Given an alias whose `params.extra.provider` has `order: deepinfra`, `allow_fallbacks: no-thanks`, `data_collection: some`, `zdr: 1` or `quantizations: [8]`,
  when it is parsed,
  then it fails at that key.
