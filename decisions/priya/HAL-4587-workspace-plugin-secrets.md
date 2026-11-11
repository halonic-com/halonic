# Decision: a workspace can't pick a secret that belongs to a plugin

- Requirements: `ports.workspace-secrets` (`packages/core/ports/requirements/workspace-secrets.md`)
- Task: HAL-4587, the follow-up of HAL-4583
- Approval: [HAL-4583](/HAL/issues/HAL-4583#comment-66ae8c83-fc09-4602-94ff-72bed5ca7f2c), the CTO's decision that `workspaceSecrets` refuses `plugin__` names
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0sed0lnAJWBNNgum1iFrY0hz6wXjZ2vNxWpUZG3yjpcDzY2I/pbFtYlglem9syX1g8xx8AeAVFdddqNl3p2eBg==

## What changes

`workspaceSecrets` now also refuses a name that starts with `plugin__`, compared in `secretKey` form
like the token prefix `halonic_token_`. Its `get` throws
`RangeError("A workspace can't pick a secret that belongs to a plugin.")` and doesn't ask the store.
The ports package exports `pluginSecretNamePrefix` and `isPluginSecretName` for it. Other names that
only look alike, such as `plugin-key` or `plugins__weather__acme-key`, are still read.

## Why

The app keeps a plugin's secret under `plugin__<id>__<secret>` (halonic#1465). Plugin secrets share
the store with the names a workspace picks, so without this a workspace file could name another
plugin's secret and read it.

## Tests

No test was weakened. New tests cover the refused plugin names in several spellings, the look-alike
names that are still read, `isPluginSecretName` itself, and that `isHalonicSecretName` stays false
for a plugin's secret.

## Covers

- `ports.workspace-secrets`
