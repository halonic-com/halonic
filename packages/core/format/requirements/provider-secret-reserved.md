# format.provider-secret-reserved

- Status: active
- Since: unreleased
- Source: HAL-16691, Liam's review of #5370 (HAL-16636)

When `parseFile` reads a provider file whose `secret` names a secret that belongs to Halonic (`token-key`, `serve-password`, any name under `halonic_token_`) or to a plugin, the format shall refuse it with `secret-name-reserved` at `secret`, as it does for a connector's and a webhook routine's secret, so no host tests or saves a model key under that name.

## Examples

- Given `id: anthropic`, `type: anthropic` and `secret: token-key`, when it is parsed, then it fails with `secret-name-reserved` at `secret`, saying the name belongs to Halonic or to a plugin and to store the key under a name of its own, such as anthropic-api-key.
- Given `secret: serve-password`, when it is parsed, then it fails with `secret-name-reserved` at `secret`.
- Given `secret: team-key`, when it is parsed, then it has no problem.
