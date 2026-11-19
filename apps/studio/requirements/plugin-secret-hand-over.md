# studio.plugin-secret-hand-over

- Status: active
- Since: unreleased
- Source: HAL-13652; ADR 2026-11-19 "Studio hands a plugin its secrets"; `agent-host.plugin-secrets`

When Studio calls a tool of a plugin's backend through the agent host, and the plugin declares a secret, Studio shall first hand the agent host every secret the plugin declares that the keychain holds, read from the keychain now under the plugin's own name for it and sent by the name the plugin declares, and shall then make the call. A secret the keychain doesn't hold shall be left out, so the host forgets one the person removed. A plugin that declares no secret shall hand nothing over. If the hand-over fails, then Studio shall not make the call and shall fail with the hand-over's error.

## Examples

- Given a plugin `acme-weather` that declares `acme-key`, kept in the keychain under `plugin__acme-weather__acme-key`,
  when Studio calls its tool,
  then the host is handed `{ "acme-key": … }` for `acme-weather`, and the call follows.
- Given the keychain holds no `acme-key` for it,
  when Studio calls its tool,
  then the host is handed no secret for `acme-weather`, and the call follows.
- Given a plugin that declares no secret,
  when Studio calls its tool,
  then nothing is handed over and the call is made.
- Given the host refuses the hand-over,
  when Studio calls the tool,
  then no call is made and the call fails with the host's refusal.
