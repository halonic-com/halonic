# server.webhooks

- Status: active
- Since: 0.1.0
- Source: HAL-195 (plan D22, webhook triggers for routines; build plan PR 7b); HAL-9 plan phase 4

The server shall let a signed web request start a routine that has a `webhook` trigger, on `POST /api/webhooks/<hubId or @workspace>/<routineId>`. The sender signs instead of signing in. Its request carries `x-halonic-delivery` (a delivery id of 1 to 128 letters, digits and `._:-`), `x-halonic-timestamp` (whole Unix seconds) and `x-halonic-signature` (`sha256=` and the hex HMAC-SHA-256 of `<delivery id>.<timestamp>.<body>`), keyed with the secret the routine's `trigger.webhook.secret` names, which the server reads from the `Secrets` port at every request, never from the routine file. The signature is checked in constant time.

Before the signature is proven, every refusal shall give the same answer, 401 `webhook_rejected` with a fixed message: an address that isn't two plain segments, no such routine, a routine that is switched off or has another trigger, a secret that is not set or that a workspace may not pick (Halonic's own, a plugin's), a missing or malformed header, a timestamp more than 300 seconds from the server's clock in either direction, and a wrong signature. So a caller who can't sign learns nothing about the routines, their state or their secrets.

After the signature is proven, the server shall ask the trust gate, every time, and refuse with 403 `workspace_not_trusted` unless the state is `trusted`; an unsigned request never learns the trust state. It shall then claim the delivery id for 600 seconds (two windows) through `Coordination.tryAcquire`, and answer a delivery it has seen with 409 `webhook_replayed`, starting nothing. The id is signed with the body, so changing the id or the timestamp of a captured request breaks the signature. It shall start the routine with `routineStart`: the body and the headers the routine lists reach the run as `{{trigger.body}}` and `{{trigger.headers.<name>}}`, and no other header does. The run starts with a `webhook` trigger holding the routine's key and the delivery id, and with a run id made from the routine and the delivery id, so the executor itself starts nothing twice. A start that fails shall give the delivery id back, so the sender's retry gets through, and the request answers 500. A started run answers 202 with its run id only.

The route sits behind the same `Host` check, `Origin` check, daily ceiling and body limit as every route, and needs no session.

## Examples

- Given a routine with a webhook trigger and a request signed with its secret, when it arrives, then a run starts with the body in the input, and the answer is 202 with the run id.
- Given the same request sent twice, then the second answers 409 and starts nothing.
- Given the delivery id header changed on a captured request, then it answers 401.
- Given a timestamp 301 seconds old, or 301 seconds ahead, then it answers 401; at 300 seconds it starts.
- Given a wrong signature, an unknown routine, a switched-off routine, a routine with a schedule trigger and a missing secret, then each answers the same 401 body and starts nothing.
- Given a routine that names `serve-password` as its secret, and a request signed with the stored hash, then it answers 401.
- Given a validly signed request to a workspace that isn't trusted, then it answers 403 and starts nothing, and the delivery id is still free; given an unsigned one, it answers 401.
- Given an executor that fails the start, then the request answers 500, and the same signed request sent again starts the run.
- Given `authorization` and `x-event` headers and a routine that lists only `x-event`, then the run gets `x-event` only.
- Given a request with a `Host` the server doesn't answer to, then it answers 421 before anything is checked.
