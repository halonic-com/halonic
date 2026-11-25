# server.routines

- Status: draft
- Since: unreleased
- Source: HAL-18490 (PR S10, on the PR watcher's critical path, HAL-17974); today only the desktop engine runs routines (`workspaceRoutineScheduler` in `apps/agent-host/src/engine/open-engine.ts`)

The server (`halonic serve`) shall run the served workspace's routines with the same scheduler code as the desktop engine (`workspaceRoutineScheduler`), shared rather than copied, with its ticks driven through the `Scheduler` port. Each time a routine that is on falls due, the server shall start its workflow or agent once, as `routines.routine-start` fills it, as a normal run that the run list (`server.run-routes`) shows with the routine's key, and a run that fails shall show as failed and shall not stop the routine's next pass. While the served workspace isn't trusted (`server.trust-gate`), no routine run shall start. While routines are paused, the server shall start no routine run and skip the times that fall due, as `agent-host.engine-routine-pause` does, and it shall report `paused` and `nextRoutineAt` as `agent-host.engine-health-next-routine` defines them. A routine run on the server shall reach Paperclip only through the workflow's tool steps and the server's Paperclip connection (`server.paperclip-key-store`).

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

## What it doesn't cover

How the owner pauses the server's routines (a console subcommand or an owner route) is the S10 builder's choice, written into this requirement when it becomes active. The desktop engine's routine requirements don't change.
