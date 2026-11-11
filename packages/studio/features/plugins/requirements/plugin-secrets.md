# plugins.plugin-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-1740; Liam's decision on HAL-4540; ADR `docs/adr/2026-11-09-plugins.md`

The Studio shall save a plugin's `secret` setting to the keychain under the plugin's own name for that secret, `plugin__<id>__<secret>`, and never under the name the plugin declares, and shall keep the stored secret when the field is left empty. When the plugin's other settings don't fit, then the Studio shall save nothing, secrets included. When a plugin is removed, the Studio shall delete every secret under the plugin's own names and then its setting values, and if a secret can't be saved or deleted, then the Studio shall carry on with the rest and name that secret.

## Examples

- Given the weather plugin's setting `key` for the secret `weather-key`,
  when the person saves `abc` in it,
  then the keychain holds `abc` under `plugin__weather__weather-key`, and nothing under `weather-key`.
- Given the setting `city` is required and left empty,
  when the person saves `abc` as the key,
  then nothing is saved and the keychain is unchanged.
- Given the keychain can't delete `plugin__weather__weather-key`,
  when the person removes the weather plugin,
  then `plugin__weather__acme-key` and the settings are still deleted, and Studio names `weather-key`.
