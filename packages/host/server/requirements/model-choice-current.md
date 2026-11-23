# server.model-choice-current

- Status: active
- Since: unreleased
- Source: HAL-16708 (HAL-14808 PR 4a); HAL-16248 (the served window's Settings › Models row names the current model)

When the host passes a `modelChoice` port, `GET /api/model-choice/current` shall answer `{"current": <what the service's current() gives>}`, or `{"current": null}` when it gives nothing, on the signed-in session's service, behind the same checks and with the same `Cache-Control: no-store` as the other model choice routes (`server.model-choice-routes`). Any other method on it shall answer 404 `not_found`.

Rationale: the served window's Model row names the model `default` uses now, and only the computer reads the workspace's files.

## Examples

- Given a service whose `default` is the test model, then the answer is `{"current": {"kind": "sample"}}`.
- Given a `POST` to `current`, then the answer is 404 `not_found`.
