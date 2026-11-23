# Decision: a model alias's OpenRouter host pin is checked when the models file loads

- Task: HAL-16834
- Approval: Liam approved this on HAL-16826 (the OpenCode harness plan, PR 1, with four conditions) and reviews it on HAL-16834, the security review of halonic#5431. A team decision with no board card (HAL-2282 rule): it narrows one key of a file format, no screen or flow.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:8+qDW7HnEe/psUDEqZvGaPoNrOIIag1MDgXVkz1vN20QqHtiDqXjViQuwM88ogLWO5UH3htd3dk30cO5w9KxBQ==

## What changes

A model alias's `params.extra.provider` is OpenRouter's host routing, and the bridge now sends it
to OpenRouter for both routes. Liam's second condition says a pin that breaks the rules fails when
the models file loads, not on the first call. So the alias schema now describes `extra.provider`:
only the keys `order`, `only`, `ignore`, `allow_fallbacks`, `data_collection`, `zdr` and
`quantizations`, with `order`, `only`, `ignore` and `quantizations` lists of strings,
`allow_fallbacks` and `zdr` true or false, and `data_collection` `allow` or `deny`. The goldens
`packages/core/format/spec/models.schema.json` and `packages/core/format/spec/hub.schema.json`
(hub aliases use the same schema) are regenerated with that shape. Every other part of both
schemas is unchanged, and other keys under `extra` stay free.

## Why

The pin decides which hosts may serve a call, so it comes only from trusted host config, and a
mistake in it must stop the load where the author sees it rather than go out unchecked. A models
file that used another key under `extra.provider` (such as `sort`) no longer loads; the pins in
use today use only the allowed keys and still load.

## Covers

- packages/core/format/spec/models.schema.json
- packages/core/format/spec/hub.schema.json
