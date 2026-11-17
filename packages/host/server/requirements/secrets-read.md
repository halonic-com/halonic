# server.secrets-read

- Status: active
- Since: unreleased
- Source: HAL-1292 (T4, PR 4a); models flow 3.3 (the API key's rules)

The server shall answer `GET /api/secrets/<name>`, behind the sign-in, with `{"stored": true}` or `{"stored": false}` for a provider key, and nothing else: it shall never answer a value. It shall do this only when the host gave it a `providerKeys` store; without one the route shall answer 404 `keys_not_supported`, for every verb. `GET` and `DELETE` stay allowed over plain http, since `GET` returns only a yes or no.

Rationale: the key block must show "A key is saved" without the key ever travelling back to the page.

## Examples

- Given a stored key `openai-key`, when `GET /api/secrets/openai-key` is sent, then the answer is `{"stored": true}`.
- Given no key under that name, then the answer is `{"stored": false}`.
- Given a host with no `providerKeys` store, then every verb answers 404 `keys_not_supported`.
