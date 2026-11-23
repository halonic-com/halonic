# router.pinned-host

- Status: active
- Since: unreleased
- Source: HAL-16998; Q1 in architecture note section 9 on HAL-16984 (the adapter sets the pinned host from the catalog; the agent never does); OpenRouter routing field from HAL-16834

When an adapter asks for the alias a run starts with, the catalog shall return the catalog's alias with `params.extra.provider` set to OpenRouter's routing for its `pinnedHost` (that host as the only one and the first in order, fallbacks off, data collection denied), keeping the alias's other `params.extra` keys, and shall return an alias without a `pinnedHost` unchanged.

## Examples

- Given an alias pinned to `deepinfra/fp8`, such as `deepseek-flash`,
  when the adapter asks for its alias,
  then `params.extra.provider` is `{ order: [deepinfra/fp8], only: [deepinfra/fp8], allow_fallbacks: false, data_collection: deny }`.
- Given a pinned alias whose `params.extra` also has `top_k: 40`,
  when the adapter asks for its alias,
  then `top_k` is still 40.
- Given `opus`, which has no pinned host,
  when the adapter asks for its alias,
  then it is the catalog's alias unchanged.
