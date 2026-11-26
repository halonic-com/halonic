# server.routines

- Status: active
- Since: unreleased
- Source: HAL-18490 (PR S10, on the PR watcher's critical path, HAL-17974), built on HAL-18499; before it only the desktop engine runs routines (`workspaceRoutineScheduler` in `apps/agent-host/src/engine/open-engine.ts`)

The server (`halonic serve`) shall run the served workspace's routines with the same scheduler code as the desktop engine (`workspaceRoutineScheduler`), shared rather than copied, with its ticks driven through the `Scheduler` port. Each time a routine that is on falls due, the server shall start its workflow or agent once, as `routines.routine-start` fills it, as a normal run that the run list (`server.run-routes`) shows with the routine's key, and a run that fails shall show as failed and shall not stop the routine's next pass. While the served workspace isn't trusted (`server.trust-gate`), no routine run shall start. A routine that `halonic routines watch` leaves out (its file has errors, it starts an agent on its own, or its workflow has an agent in a harness) shall not start on the server either, and `halonic serve` shall print the same ✕ line for it once; the other routines shall start. While routines are paused, the server shall start no routine run and skip the times that fall due, as `agent-host.engine-routine-pause` does, and it shall report `paused` and `nextRoutineAt` as `agent-host.engine-health-next-routine` defines them. `halonic serve` shall run its routines from the start. When a signed-in owner sends `PUT /api/routines/pause` with the JSON body `{"paused": true}` or `{"paused": false}`, the server shall pause or resume the routines from the next tick and answer 200 with the health; `GET /api/routines/health` shall answer the health, with the fields of the engine role's `health` frame but `kind`. If the caller isn't signed in while a password is set, then both routes shall answer 401 and change nothing. If the pause body isn't sent as `application/json`, then the server shall answer 415; if it has any field but `paused`, or a `paused` that isn't `true` or `false`, then it shall answer 400 and change nothing. A server whose host gives no routine schedule shall answer both routes with 404. A routine run on the server shall reach Paperclip only through the workflow's tool steps on a `paperclip` connector and the server's Paperclip connection (`server.paperclip-key-store`), as `cli.serve-paperclip-tools` defines them (HAL-19721): with no key stored for the connection, the step shall send nothing and the run shall fail with `signed-out`, so it shows as failed, and in the Inbox's notices of the routine's failed runs.

## Examples

- Given a fixture workspace with a routine every 10 minutes and a fake clock,
  when 30 minutes pass,
  then the run list shows exactly 3 runs of that routine.
- Given the same workspace with routines paused,
  when 30 minutes pass,
  then no run starts, and after the resume none of the skipped times is caught up.
- Given a routine whose workflow fails,
  when it falls due twice,
  then the run list shows two failed runs.
- Given a routine whose file has errors next to one that is fine,
  when both fall due,
  then only the fine one starts, and `halonic serve` prints the ✕ line of the other.
- Given a trusted workspace whose live version gains a model provider nobody trusted,
  when its routine falls due,
  then no run starts.
- Given a routine whose workflow's first step reads `pr-watcher-pass` on a `paperclip` connector, and no key stored for its connection,
  when it falls due,
  then its run fails with `signed-out` and Paperclip receives nothing.

- Given a server with a password set and a caller who isn't signed in,
  when it sends `PUT /api/routines/pause` with `{"paused": true}`,
  then it gets 401 and the routines keep running.
- Given the body `{"paused": "yes"}`,
  when a signed-in owner sends it,
  then the server answers 400 and pauses nothing.

## What it doesn't cover

The desktop engine's routine requirements don't change: its schedule is the same code, moved to `@halonicjs/app/routines` (`EngineSchedule`). Studio has no pause switch for a server yet; the owner uses the route.
