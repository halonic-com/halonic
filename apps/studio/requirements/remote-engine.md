# studio.remote-engine

- Status: active
- Since: unreleased
- Source: HAL-14861 (B1 step 4 PR 2, plan on HAL-14219, Liam's approval there); design note D3 and D8 on HAL-14206; `services.engine-fetch`; the untrusted refusal's code (HAL-14813)

When a desktop window opens a workspace folder, the Studio shall ask the shell once, with `GET /api/hello`, whether an engine runs for that workspace. If the engine answers, the window shall start runs (`POST /api/runs`), Run now (`POST /api/routines/<hub>/<routine>/run`), list the runs that wait for a person (`GET /api/waiting-runs`), send the Inbox's answers and cancel runs through that engine, and shall open no engine of its own, so it takes no engine lock and runs no routine timers. If the shell has no engine (`engine_unavailable`), the window shall run its own engine as before. If the engine goes away after the folder opened, each call shall fail as `unavailable` ("The engine isn't answering.") and the window shall not start its own engine. The engine's refusals shall fail with the engine's own sentence and an error kind by status: 400 and 415 `invalid_input`, 403 `denied`, 404 `not_found`, 409 `conflict`, 429 `limit_reached`, any other `unavailable`; a 403 `workspace_not_trusted` shall be `denied` with the code `workspace.untrusted`, as the window's own engine refuses.

## Examples

- Given the shell reports an engine for the folder,
  when the person runs a workflow,
  then the shell gets `POST /api/runs` with the hub, the workflow and the input, and no engine lock is taken.
- Given the shell reports no engine,
  when the person runs a workflow,
  then the window opens its own engine, which takes the engine lock.
- Given the engine runs the workspace,
  when the person presses Run now on routine `nightly` at the workspace root,
  then the shell gets `POST /api/routines/{hub}/{routine}/run` with `@workspace` and `nightly`, and the routine's run id comes back.
- Given the engine answers 409 `routine_off` to Run now,
  then it fails as `conflict` with "This routine is switched off. Switch it on to run it."
- Given the engine answers 403 `workspace_not_trusted` to Run now,
  then it fails as `denied` with the code `workspace.untrusted`; a 403 with another code fails as `denied` without it.
- Given the engine stopped after the folder opened,
  when the Inbox lists what waits,
  then it fails as `unavailable` with "The engine isn't answering."
