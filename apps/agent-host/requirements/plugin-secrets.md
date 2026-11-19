# agent-host.plugin-secrets

- Status: active
- Since: unreleased
- Source: HAL-13652; ADR 2026-11-19 "Studio hands a plugin its secrets"

When Studio hands the agent host a plugin's secrets with `POST /v1/plugins/secrets`, each by the name the plugin declares, the agent host shall check its own trust record against the plugin's folder now, keep each value in memory only under the plugin's own name for it, `plugin__<id>__<secret>`, which it builds itself, and replace everything it held for that plugin, so an empty set forgets them. It shall answer the number kept, and no answer, error or log line shall hold a value. A plugin's backend shall read its secrets from these values, and a name that isn't a plugin's shall read as none. If the request's `Sec-Fetch-Site` isn't `same-origin`, then the agent host shall answer 403 `secret_from_other_site` before it reads the body. If the body doesn't fit (more than 32 secrets, a name longer than 64 characters, a value empty or longer than 16,384 characters), then it shall answer 400 `body_invalid` with no detail. If the trust doesn't cover the plugin, then it shall answer 403 `plugin_not_trusted` and drop the values it held for that plugin, as it does when a call finds the plugin no longer trusted. If a name isn't one the plugin declares, then it shall answer 400 `secret_not_declared` and keep none of them. In every refusal it shall keep nothing new. When the agent host stops, it shall drop every value.

## Examples

- Given a trusted plugin `acme` that declares `acme-key`,
  when Studio hands over `acme-key`,
  then the answer is `{ kept: 1 }` and the backend reads the value as `plugin__acme__acme-key`.
- Given values held for `acme`,
  when Studio hands over an empty set,
  then the backend reads `plugin__acme__acme-key` as none.
- Given a hand-over from a page of another site,
  when the host reads the request,
  then the answer is 403 `secret_from_other_site` and nothing is kept.
- Given a hand-over that names `other-key`, which `acme` doesn't declare,
  when the host reads it,
  then the answer is 400 `secret_not_declared` and the values held before stay as they were.
- Given values held for `acme`,
  when the trust no longer covers `acme` at a call or a hand-over,
  then the answer is 403 `plugin_not_trusted` and the backend reads the values as none.
- Given values held for `acme`,
  when anything reads `openai-key` or `plugin__rain__acme-key` from the host's store,
  then it reads none.
- Given a value Studio handed over,
  when a hand-over fails or succeeds,
  then neither the answer nor the host's log holds the value.
