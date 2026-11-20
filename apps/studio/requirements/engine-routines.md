# studio.engine-routines

- Status: draft
- Since: unreleased
- Source: HAL-14205 (Step A of HAL-45); `cli.commands.routines.watch`; `studio.engine-service`; `app.scheduler-live-routines`

While the workspace's engine is open in the page, the Studio shall start the workspace's routines on time with the routine scheduler `halonic routines watch` uses, on the engine's own tick, and stop it when the engine closes (the workspace changes, the window closes, the lock is lost or the trust is removed), so no routine starts from a closed engine. It shall name the workspace by the id in its `workspace.yaml`, or by its folder's name when it gives none, as `halonic routines watch` does, so the CLI and the Studio share one last tick and never start one time twice. A schedule that names no zone shall use the computer's. As soon as the engine opens, the scheduler shall tick once, so the times missed while no engine ran, the window closed or the computer asleep, start then under each routine's `catchUp`. A tick that comes while that catch-up still runs shall wait for it, not be dropped, so a time that comes as the engine opens still starts. The routines shall be read from the saved files on every tick, as the page's engine starts every run from the saved files, so a routine turned off starts nothing from the next tick on. Before each routine's run starts, the page shall make the checks a start from the window makes: a workflow the page can't run is refused as `unavailable`, and a workspace that may start nothing starts nothing; each refusal is said through `reportError`, and the other routines go on.

## Examples

- Given a routine that runs at the start of every hour and an engine opened at 10:00:30,
  when the clock passes 11:00,
  then a run of its workflow starts, due at 11:00.
- Given the engine closed at 10:00:30 and opened again at 13:30,
  when it opens,
  then one run starts, due at 13:00 (`catchUp: last`).
- Given the catch-up is still reading the saved files when 11:00 passes,
  when it finishes,
  then the tick for 11:00 runs after it and the routine's workflow starts.
- Given the engine has closed,
  when the clock passes 11:00,
  then nothing starts.
- Given the routine's workflow has an agent that lists a connector,
  when its time comes,
  then no run starts and the refusal is reported as `unavailable`.
- Given the same workspace in the folders `/acme` and `/elsewhere/acme-copy`,
  when the same time comes in each,
  then the runs have the same id.
