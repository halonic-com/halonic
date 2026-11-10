# integration-runner.strict-protocol

- Status: active
- Since: 0.1.0
- Source: HAL-4281 (HAL-983, design HAL-958 sections 3.2 and 3.4, attack cases A21, A26, A33, A38)

If the runner sends anything outside the protocol (a frame before a `ready` with this start's nonce, a second `ready`, a frame of an unknown type or shape, a line that is not a frame, a result for a call that isn't running, a pong for no ping, a request number used twice, a request for a call Halonic never started, or a pull or cancel for a body it doesn't own), then Halonic's side of the bridge shall report it as blocked, stop and kill the runner, and fail every call still waiting.

## Examples

- Given a runner whose `ready` carries an old nonce,
  when it starts,
  then the connection fails, the block is reported and the runner is killed.
- Given a started runner,
  when it sends a second `ready`,
  then the runner is stopped with the reason `protocol` and a running call fails.
- Given a started runner,
  when it sends a `pull` for a body it never got,
  then the runner is stopped with the reason `protocol`.
- Given a started runner,
  when it sends a `result` for a call that already has its result,
  then the runner is stopped with the reason `protocol`.
