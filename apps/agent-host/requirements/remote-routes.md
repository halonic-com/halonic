# agent-host.remote-routes

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 10–13 (HAL-12232); task HAL-12237; requirement `ports.remote-control`

The agent host shall serve its `RemoteControl` to Studio on loopback, behind the launch token: `GET /v1/remote/state` shall stream the remote state, one per line, the current one first and then each change; `POST /v1/remote/on`, `/v1/remote/allow-risky`, `/v1/remote/revoke` and `/v1/remote/revoke-all` shall take one step each and answer `{ ok: true }`. `POST /v1/remote/pairing` shall open a pairing and stream a first line with its id, then its pairing events until `paired` or `ended`; `/v1/remote/pairing/answer`, `/new-code` and `/close` shall act on the pairing whose id they name. When the caller leaves a pairing's stream before it ends, the host shall close that pairing, so closing the dialog ends its code. When the host's rules refuse a step, the host shall answer 409 `remote_refused`; when a step fails, 500 `remote_failed`; when a pairing's id isn't open, 404 `unknown_pairing`; and when a body isn't one the route takes, 400.

## Examples

- Given a state stream, when remote is turned on, then the stream's next line says `on: true`.
- Given an open pairing stream and a phone at the check code, when Studio posts `{ pairing, allow: true }` to `answer`, then the stream sends `paired` and ends.
- Given an open pairing stream, when Studio stops reading it, then the pairing closes and its id answers 404.
- Given a host that doesn't offer remote, when Studio posts `{ on: true }`, then the answer is 409 `remote_refused`.
- Given a request without the launch token, then the answer is 401.
