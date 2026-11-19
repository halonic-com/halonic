# app.plugin-local-tool-config

- Status: active
- Since: unreleased
- Source: HAL-12343 (wiring plugin local tools into the apps); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 4

The `localToolConnectorConfig` function shall build the `stdio` connector config of one local tool from the plugin's manifest as it was checked for the session, with the id `localToolConnectorId` gives. A script shall start with its `program` and the absolute path of its file in the session's copy of the plugin, never in the plugin's own folder; a package shall start as `npx -y <name>` or `uvx <name>`, with the pin `app.plugin-trust` keeps for it. The manifest's `args` shall follow. Each `env` variable that takes a setting shall hold the setting's value as text, and one whose optional setting has no value shall be left out; when a required setting has no value, it shall build no config and give `settings-not-set` with those settings' names. Each `env` variable that takes a secret shall be in `secretEnv` under the name `app.plugin-secret-names` gives, never in `env`, and no secret's value shall be read. The sites shall be the manifest's `network`.

## Examples

- Given the weather plugin's `files` tool, started by the package `@acme/files-mcp` at 3.1.4, with the setting `root` saved as `~/Documents`,
  when its config is built,
  then it starts `npx -y @acme/files-mcp --read-only` with the npm pin at 3.1.4, `ACME_ROOT` is `~/Documents`, `ACME_KEY` is the secret `plugin__weather__acme-key`, and the sites are `api.acme.com`.
- Given a local tool started by the script `server/main.js` with `node`, and a copy of the plugin at `/session/plugin`,
  when its config is built,
  then it starts `node /session/plugin/server/main.js` and has no pin.
- Given a number setting saved as `3` and a yes/no setting saved as `false`,
  when the config is built,
  then their variables are `3` and `false`.
- Given a required setting with no saved value and no default,
  when the config is built,
  then there is no config, and the answer is `settings-not-set` naming that setting.
- Given an optional setting with no value,
  when the config is built,
  then its variable is left out.
