# agent-host.plugin-sign-ins

- Status: active
- Since: unreleased
- Source: HAL-8613 (PR 5b: the host runs sign-ins for trusted plugins, decided on 19 Nov); Julian's notes of 13 Nov (one source for settings and secret names); ADR 2026-11-19 "Studio hands a plugin its secrets"

The agent host shall run the sign-ins of a plugin's backend under the plugin's id, which is the integration's name and its backend sheet's id, and only for a name that can be a plugin's id. At every read of a sign-in's sheet, settings or client secret it shall read the plugin's folder and check its own trust record against it, as a backend's start does, and take the backend sheet, the settings and the secret names from the same place a backend's start loads them (`pluginBackendChoices`). It shall read the client secret only from the plugin's own secrets Studio handed over, `plugin__<id>__<secret>`, by the name the plugin declares. If the plugin isn't in the profile, changed since it was trusted or isn't trusted, then the sign-in routes shall answer 404 `unknown_integration` and no sheet or client secret shall be read. A backend's start shall be given the sign-in tokens of its own plugin, so a request that places a sign-in's token carries it and the backend never sees it.

## Examples

- Given a trusted plugin `acme` whose backend declares the sign-in `acme-account` and the saved setting `clientId: acme-app`,
  when its sign-in is read,
  then the sheet's id is `acme`, it has the sign-in `acme-account`, and the settings are `{ clientId: acme-app }`.
- Given handed-over values for `plugin__acme__acme-client` and `plugin__rain__acme-client`, and a workspace secret `acme-client`,
  when `acme`'s sign-in reads its client secret `acme-client`,
  then it reads the value of `plugin__acme__acme-client` only, and the name `plugin__acme__acme-client` itself reads as none.
- Given a plugin nobody trusted, or one whose file changed after it was trusted,
  when its sign-in is read,
  then it is refused as `plugin_not_trusted`, and the routes answer 404 `unknown_integration`.
- Given the name `../acme` or `Acme`,
  when the host looks up its sign-ins,
  then it runs none.
- Given a trusted plugin `acme`,
  when its backend starts,
  then the start is given `acme`'s sign-in tokens.
