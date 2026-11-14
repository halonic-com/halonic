# executor-remote.runs

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10d, remote run executor); PR 10 plan approved on HAL-9093

The client shall be a `RunExecutor` with id `remote` that forwards `start` to `POST /api/runs`, `startAgent` to `POST /api/agent-runs`, `send` to `POST /api/runs/<id>/events` (with `event`, `payload` and the `callId` option), `cancel` to `POST /api/runs/<id>/cancel` and `chatTurn` to `POST /api/chat-turn`, each with a JSON body, and return the summary or response the host answers. A run id is encoded as one path segment. A start that the host answers with `hub_not_found`, `workflow_not_found` or `agent_not_found` shall reject with `RunTargetNotFound` of that kind and the id the caller sent. A start that sets a field the host's start routes don't take (`kind`, `trigger`, `harness`, `cantTry`, `version`) shall reject with a `RangeError` before any request is sent, instead of running something other than what was asked. Any other refusal rejects with a `RemoteHostError` that carries the host's status and code. A chat turn's `signal` is never sent: it aborts the request, and the host aborts the model call when the request closes. The adapter passes the shared `RunExecutor` contract suite against the real host.

Rationale: callers use the port and never ask whether a run is local or remote; a field the host would drop silently must not be dropped, and the port's errors must be the same ones the local executor throws.

## Examples

- Given a host that answers `workflow_not_found`, when `start` names workflow `tidy`, then it rejects with `RunTargetNotFound("workflow", "tidy")`.
- Given `start({ ..., harness: "codex" })`, then it rejects with a `RangeError` and sends nothing.
- Given `send("run/1", "approve", undefined, { callId: "c1" })`, then the request goes to `/api/runs/run%2F1/events` with body `{ "event": "approve", "callId": "c1" }`.
- Given a host that answers 409 `event_not_accepted`, then `send` rejects with that code.
- Given a chat turn with a `signal` that is aborted, then the call rejects and the body sent had no `signal`.
