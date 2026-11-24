# harness-host.bridge-fallback

- Status: active
- Since: unreleased
- Source: HAL-17315 (router PR 4b, decided on HAL-16992, Q3: within a run, fall back only to the same model and data class; plan on HAL-17001, approved by Liam on HAL-17213)

When `ProviderKeyServices` gives a harness agent's bridge a key of the provider its model alias names, and that provider's `baseUrl` host is exactly `openrouter.ai`, the access shall carry the alias's name as `alias`, and as `fallbacks` the entries of the alias's `fallback` list, in order, that name the same provider file and the same model, each with its alias and its `params.extra.provider` as `routing` (`{}` when it sets none). It shall leave out every entry whose pin keeps the data less safe than the alias's own (`data_collection: deny` stays `deny`, `zdr: true` stays `true`, `allow_fallbacks: false` stays `false`), and give at most the first 3 that remain, which the bridge may move a call on to (requirement `harness-bridge.host-fallback`). An access at any other host, a key that isn't the alias's own provider's, an agent whose `model` is no alias, and the program's own sign-in shall get neither `alias` nor `fallbacks`.

## Examples

- Given the keyed provider `openrouter` at `https://openrouter.ai/api` and the alias `fast` of `acme/flash` with a pin with `data_collection: deny`, falling back to `fast-backup`, another alias of `openrouter` and `acme/flash` with such a pin,
  when the bridge's services of an agent whose `model` is `fast` are asked for,
  then its access has `alias: "fast"` and `fallbacks: [{ alias: "fast-backup", routing: <fast-backup's pin> }]`.
- Given that `fast` also falls back to an alias of another model, an alias of the same model in another provider file at the same address, and an alias of the same model whose pin doesn't set `data_collection: deny`,
  when its agent's bridge services are asked for,
  then its `fallbacks` hold only `fast-backup`.
- Given an alias that falls back to four aliases of the same model and provider file, each with a pin that denies data collection,
  when its agent's bridge services are asked for,
  then its `fallbacks` hold the first three, in the alias's order.
- Given an alias with fallbacks whose provider is at `https://models.acme.example/api`,
  when its agent's bridge services are asked for,
  then its access has no `alias` and no `fallbacks`.
- Given the alias `fast`, when the app's alias rules give it no keyed provider,
  then its access has no `alias` and no `fallbacks`.
