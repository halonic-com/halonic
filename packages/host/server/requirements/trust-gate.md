# server.trust-gate

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4 (v1.5: the host enforces the trust gate); HAL-78 trust-gate review; build plan on HAL-195 (PR 5)

The server shall ask the host's trust gate, through the `TrustGate` port, before it starts any run, and shall start nothing unless the gate answers `trusted`. It shall ask again for every start and never remember an answer, so a workspace that changed since it was trusted starts nothing. The routes that start a run are `POST /api/runs` (a workflow) and `POST /api/agent-runs` (one agent); both need a sign-in when a password is set, and both answer 403 with the code `workspace_not_trusted` and start nothing when the state is `new`, `changed`, `unreadable` or `refused`. A gate that throws shall count as no trust: the request fails with 500 and no run starts. The server shall show the decision read-only, on `GET /api/trust` (state and message, behind the sign-in), and shall have no route and no port method that grants trust, saves a record or updates one: only a person at the computer grants trust, with `halonic trust`. A start that the executor rejects with `RunTargetNotFound` (the hub, workflow or agent doesn't exist) answers 404 with the code `run_target_not_found` and a fixed message that names nothing; any other failure of a start answers 500. Both start routes shall refuse a body whose `Content-Type` isn't `application/json` with 415 `unsupported_media_type` before the gate is asked, with a password or without one, so a form a web page posts across sites, with no `Origin` header, starts nothing. A start request that is malformed shall be refused with 400 before the gate is asked.

Rationale: a page, an app or a script that reaches the server must not be able to start a workspace's programs, or trust the workspace itself, because trust is the person's decision about code that runs with their rights. A trusted check kept from before a change would let a rewritten connector run.

## Examples

- Given a trusted workspace and a signed-in caller, when `POST /api/runs` names a workflow, then the run starts and its summary is returned.
- Given a workspace that was never trusted, when `POST /api/runs` arrives, then it answers 403 `workspace_not_trusted` and `start` is never called.
- Given a workspace trusted at one request and changed at the next, then the first request starts a run and the second is refused.
- Given a trusted workspace and a `POST /api/runs` for a workflow the hub doesn't have, then it answers 404 `run_target_not_found`, and the body doesn't name the workflow or the hub.
- Given a gate that throws, when `POST /api/agent-runs` arrives, then it answers 500 and no run starts.
- Given a request to `POST /api/trust`, `PUT /api/trust`, `POST /api/trust/grant` or `POST /api/runs/trust`, then it answers 404 and the gate is never asked to change anything, because the port has only `check`.
- Given a form POST (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data` or no type) with no `Origin`, on a server with or without a password, when it reaches `POST /api/runs` or `POST /api/agent-runs`, then it answers 415 `unsupported_media_type` and the gate is not asked.
- Given no session on a server with a password, when `POST /api/runs` arrives, then it answers 401 and the gate is not asked.
