# agent-host-client.plugin-secrets

- Status: active
- Since: unreleased
- Source: HAL-13652; ADR 2026-11-19 "Studio hands a plugin its secrets"; `agent-host.plugin-secrets`

The plugin secrets stand-in shall offer `handOver` with a plugin's id and its secrets, each by the name the plugin declares, and ask the host's `POST /v1/plugins/secrets` with those two and nothing else, never a name the value is kept under. It shall answer the number the host kept. It shall fail with the host's kind and status when the host refuses, with a message that says why in plain words for `plugin_not_trusted`, `not_in_this_build`, `host_stopping`, `secret_not_declared` and `secret_from_other_site`, and with `answer_invalid` for an answer that isn't a hand-over's. No message shall hold a value.

## Examples

- Given a host that answers a hand-over with `{ kept: 1 }`,
  when Studio hands over `acme-key` for `acme-notes`,
  then the host gets `{ plugin: "acme-notes", secrets: { "acme-key": … } }` and the answer is 1.
- Given a host that refuses a name the plugin doesn't declare,
  when Studio hands it over,
  then it fails with the kind `secret_not_declared` and a message that names no value.
- Given a host that doesn't cover the plugin's trust,
  when Studio hands over its secrets,
  then it fails with the kind `plugin_not_trusted`.
- Given a host that answers something else with 200,
  when Studio hands over secrets,
  then it fails with the kind `answer_invalid`.
