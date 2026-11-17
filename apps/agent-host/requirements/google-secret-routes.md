# agent-host.google-secret-routes

- Status: active
- Since: unreleased
- Source: HAL-9910; Liam's plan approval on HAL-10655; `server.google-secret`, `server.google-staged-secret`

When Studio saves or replaces a Google client secret on the agent host, the agent host shall run the Google setup's own secret routes itself, with the setup records and the secret store of the profile it serves, and keep their rules: a secret that Google refused never replaces one in use. `POST /v1/google/secret` with `{ accountRef, clientSecret }` shall run the handler's save and answer what it answers (`{ saved: true }`, or 409 `secret_needs_staging` when the secret must be checked with Google first). `POST /v1/google/secret/replace` with the same body shall try the same save first and answer `{ result: "replaced" }` when it keeps the secret. When the save answers 409 `secret_needs_staging`, the agent host shall stage the secret, check it with Google, and answer `{ result }` with the handler's own outcome: `accepted` (with `accountsFixed`, the refs the secret fixed), `refused`, `signInRefused`, or any other kind the check ends with, such as `unreachable`. It shall pass each outcome on as its own word and never fold one into another. The agent host shall not discard or promote a staged secret itself: it leaves the staged and the in-use secret as the handler leaves them, and a retry stages the secret again.

Each route shall build its own request to the handler, with `content-type: application/json` and the loopback `Host` of the agent host, and never forward a header of the page's request. Both routes shall refuse a request with a `Sec-Fetch-Site` other than `same-origin` (such as `cross-site` or `same-site`) with 403 `secret_from_other_site` before they read the body; a request with no such header passes. Both routes shall sit behind the same launch token as every other `/v1/google/*` route. The agent host shall refuse a body with an unknown key, a ref that isn't a ref, or a secret that is empty or longer than 512 characters, before it reads anything. If the account has no setup, then the agent host shall answer 404. If the agent host can't finish, then it shall answer 502 `google_failed` with a fixed message, and write only the error's name to its log.

Neither answer, nor any log line, nor any error shall hold any part of the secret. The agent host's routes shall never log a body.

Rationale: the page types the secret once and sends it once; the host, which keeps the secret store, is the only place that stores it and the only one that talks to Google with it.

## Examples

- Given a setup with no secret, when Studio saves a fake secret, then the answer is `{ saved: true }` and the store holds it.
- Given a setup that never signed in, when Studio replaces its secret, then the answer is `{ result: "replaced" }`.
- Given a signed-in setup and Google that accepts the new secret, when Studio replaces it, then the answer is `{ result: "accepted", accountsFixed: [...] }` and the new secret is in use.
- Given a signed-in setup and Google that refuses the new secret, when Studio replaces it, then the answer is `{ result: "refused" }` and the old secret is in use.
- Given a signed-in setup and a refused refresh token, then the answer is `{ result: "signInRefused" }` and the staged secret is kept.
- Given a signed-in setup and Google that can't be reached, then the answer is `{ result: "unreachable" }` and both secrets are as they were.
- Given a request with `Sec-Fetch-Site: cross-site` or `same-site`, then the answer is 403 and the body is not read.
- Given a request without the launch token, then the answer is 401 and nothing is read.
- Given a body that holds a fake secret and an unknown key, a body that isn't JSON, or a failure inside the handler, then no answer, log line or error holds the secret.
