# server.secrets-remove

- Status: active
- Since: 0.1.0
- Source: HAL-1292 (T4, PR 4a); models flow 3.3 (the API key's rules)

The server shall remove a provider key on `DELETE /api/secrets/<name>`, behind the sign-in, and answer `{"removed": true}`, also when no key was stored under the name.

Rationale: "Remove key" must be safe to repeat, and it sends no secret, so plain http is not a risk.

## Examples

- Given a stored key, when it is deleted, then `GET` answers `{"stored": false}`.
- Given no key, when `DELETE` is sent, then the answer is still `{"removed": true}`.
