# agent-host-client.remote-control

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decisions 10–13 (HAL-12232); task HAL-12237; requirements `ports.remote-control` and `agent-host.remote-routes`

The client shall give Studio the agent host's `RemoteControl` over the host's `/v1/remote/*` routes. Each call to `state` shall open its own stream and check each line against the remote state's shape, and leaving it shall hang up. Each step shall go to its own route, and a step the host refuses shall reject with an `AgentHostError` that carries the host's status, kind and message. A pairing shall stay one stream: every reader of its events shall get every event so far and then each new one, its steps shall name the pairing by the id the host gave, and closing it shall ask the host to close it and then hang up. When a pairing's stream breaks before `paired` or `ended`, the pairing shall end with `closed`, so no reader waits for ever.

## Examples

- Given an open pairing that showed a code and a check code, when a second reader starts, then it gets the code and the check code first.
- Given an open pairing, when the person presses Allow, then the client posts `{ pairing, allow: true }` to `/v1/remote/pairing/answer`.
- Given a host that answers 409 `remote_refused` to `/v1/remote/on`, when Studio turns remote on, then the call rejects with that status, kind and message.
- Given an open pairing whose stream ends after its code, then its readers get the code and then `ended` with `closed`.
