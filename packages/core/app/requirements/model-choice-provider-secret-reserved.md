# app.model-choice-provider-secret-reserved

- Status: active
- Since: unreleased
- Source: HAL-16691, Liam's review of #5370 (HAL-16636)

If the workspace's file for the choice's provider names a secret that belongs to Halonic or to a plugin (`format.provider-secret-reserved`), then a tested choice's edits shall change nothing and give `provider-differs` in that file, so no host saves the pasted key under Halonic's or a plugin's secret.

## Examples

- Given a workspace whose `providers/anthropic.yaml` names the secret `token-key`, and the key choice for Anthropic,
  then the problem is `provider-differs` in `providers/anthropic.yaml`, and no secret name is given.
