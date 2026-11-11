# app.plugin-secret-names

- Status: active
- Since: 0.1.0
- Source: HAL-4540 (Liam's decision on plugin secrets); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 3

The app's `PluginService` shall give, for each secret a plugin declares in its backend or a local tool, the name its value is kept under in `Secrets`: `plugin__<id>__<secret>`. It is the only place that builds these names; the loader and a local tool's `env` resolve a declared secret through it, and removing the plugin deletes these names. Two different pairs of plugin id and secret name shall never give the same name as `Secrets` compares names (case and `-` versus `_` ignored), the name shall follow the `Secrets` name rule for the longest id and secret name `format.plugin-checks` takes, it shall never be one of Halonic's own secret names, and it shall always start with the prefix `workspaceSecrets` refuses (`pluginSecretNamePrefix` in `core/ports`), so no workspace can pick it.

## Examples

- Given the weather plugin with the backend secret `example-key` and the local tool secret `acme-key`,
  when its secret names are asked for,
  then they are `plugin__weather__example-key` and `plugin__weather__acme-key`.
- Given a plugin that declares no secret, when its secret names are asked for, then there are none.
- Given the id `a-b` with the secret `c`, and the id `a` with the secret `b-c`,
  when both are named,
  then the two names are different secrets.
- Given an id of 48 characters and a secret name of 64,
  when it is named,
  then the name is a valid `Secrets` name and not one of Halonic's own.
- Given the weather plugin's secret `acme-key`, when it is named, then no workspace may pick that name.

## Deliberate limits in v0.1

- `Secrets` is read-only in core, and no write port is added (ADR section 3). The host that saves a plugin's secret, or removes the plugin, writes and deletes these names with its own secret writer.
