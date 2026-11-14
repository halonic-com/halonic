# server.run-routes

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10a, remote run executor); PR 10 plan approved on HAL-9093

The server shall let a signed-in caller read, answer and cancel a run it already started, on three routes: `GET /api/runs/<runId>` answers the run's summary; `POST /api/runs/<runId>/events` delivers an event to the run with a JSON body `{ "event": string, "payload"?: any, "callId"?: string }` and answers the run's summary; `POST /api/runs/<runId>/cancel` cancels the run and answers its summary. All three need a sign-in when a password is set, and pass the same `Host` and `Origin` checks and the daily request ceiling as every route. A run id of another workspace, or that doesn't exist, answers 404 with the code `run_not_found` and a fixed message; the id is read from the run store, never from a header. Both POST routes shall refuse a body whose `Content-Type` isn't `application/json` with 415 `unsupported_media_type`, so a form a web page posts across sites, with no `Origin` header and the session cookie, starts nothing. A malformed event (no `event`, an empty or over-long `event` or `callId`) answers 400 before anything is asked. Delivering an event needs a trusted workspace, as a start does: with any other state it answers 403 `workspace_not_trusted` and nothing is sent. When the executor refuses the event (the run doesn't wait for it, has ended, or waits on another call than `callId`) the server answers 409 `event_not_accepted`, records the cause in the error log and never repeats it to the caller. Cancel needs no trust, because it starts nothing; an executor without `cancel` answers 501 `cancel_not_supported`. No route grants trust.

Rationale: a remote caller needs to follow and steer its runs the way a local one does. An approval lets a program run, so it passes the trust gate; stopping a run is always safe. The `Content-Type` rule closes the one hole the `Origin` check leaves, a request with no `Origin` header.

## Examples

- Given a run the store knows, when `GET /api/runs/run_1` arrives signed in, then the summary comes back.
- Given an unknown run id, when any of the three routes arrives, then it answers 404 `run_not_found`.
- Given a form POST (`application/x-www-form-urlencoded`) with a valid session cookie and no `Origin`, when it goes to `/api/runs/run_1/events`, then it answers 415 and `send` is never called.
- Given a run that waits on call `c1`, when an event arrives with `callId` `c2`, then it answers 409 `event_not_accepted` and the body doesn't say why.
- Given a workspace that changed, when an event arrives, then it answers 403 and `send` is never called; a cancel still works.
- Given no session on a server with a password, then all three answer 401 and nothing is read from the store.
