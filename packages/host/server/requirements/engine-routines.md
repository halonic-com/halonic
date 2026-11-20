# server.engine-routines

- Status: active
- Since: unreleased
- Source: HAL-14230; B1 design note D3 on HAL-14206; route shapes in `engine-api.ts` (HAL-14217)

Where the engine role serves its routes, `GET /api/routines` shall answer every routine the engine's `routines.list()` gives, read again on every call, in that order, each with its key (`<hubId>/<routineId>`, or `@workspace/<routineId>` at the workspace root), hub, id, name, whether it is on, and `nextRun`: the next time it starts on its own as an ISO time, in the engine's time zone when the schedule names none, or `null` when it is off, its trigger isn't a clock, or its schedule doesn't parse.

`POST /api/routines/<routine key>/run` (Run now) shall take only the JSON body `{}` (415 for another type, 400 for anything else), then ask the trust gate, every time, and refuse with 403 `workspace_not_trusted` before it reads any routine. It shall answer 404 `routine_not_found` for a key that names no routine or can't be one, and 409 `routine_off` for a routine that is switched off. Otherwise it starts the routine's workflow or agent now, with `{{trigger.at}}` set to now and `{{trigger.lastRun}}` to null, as a `manual` trigger that the engine records on its own clock with the routine's key, and answers 201 `{ "runId": … }`. A target that is gone answers the start's own 404 `hub_not_found`, `workflow_not_found` or `agent_not_found`, and so does a routine at the workspace root that names no hub (`hub_not_found`). An agent start while agent runs aren't built answers 501.

## Examples

- Given a daily 08:00 routine and the clock at 10:00 UTC, then its `nextRun` is 08:00 the next day; switched off, it is `null`.
- Given a routine `acme/digest` that is on, when Run now is sent, then its run starts with a manual trigger naming `acme/digest` and the answer is 201; switched off, it answers 409 `routine_off`.
- Given an untrusted workspace, when Run now is sent, then it answers 403 and no routine is read.
- Given a workspace-level routine whose target names no hub, then Run now answers 404 `hub_not_found`.
- Given the body `{"input":{}}`, then it answers 400 and starts nothing.
