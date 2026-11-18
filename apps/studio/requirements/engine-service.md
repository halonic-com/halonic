# studio.engine-service

- Status: draft
- Since: unreleased
- Source: HAL-10236, decided on HAL-10232; HAL-10849 and HAL-11378 for harness agents; `engine-lock-commands` of the shell (HAL-8792); `cli.local-engine`; the workspace's budget from HAL-11380

When the page starts or sends a run for the first time in a workspace, the Studio shall open the workspace's engine: take the shell's engine lock with `engine_lock_hold`, then build the engine from the shell's run, blob and record stores, the keychain's secrets and the workspace's files, the same engine the CLI builds, so the CLI and the Studio read the same runs and timers. It shall keep the one engine, and its lock, until the service closes, when the workspace changes or the window closes, and then release the lock with `engine_lock_release`. It shall not take the lock before the first start or send. If another engine holds the lock, it shall refuse as `conflict` naming the other process; if the engine can't open, it shall give the lock back. It shall refuse as `unavailable`, before it opens the engine, a workflow with an agent that lists a connector, because the page can start none. Where the agent host runs, the engine shall run an agent in a harness with the agent host's parts (HAL-10849, the board's yes on HAL-11378): its fenced sandbox, its harnesses, its bridges, its profile builder, its proposal folders and its placement choices, while the recorder, the tools, the approvals and the keys stay in the page. Each bridge's approvals shall be the engine's own approvals of the agent's run, so a card decides them; before the engine is built, and where it has none, they refuse every request, and nothing is approved by default. An agent set to run on this computer shall be refused before its program starts, because the agent host has no unfenced session; its sandbox check says `not-offered`, so the run page says Halonic can't run it outside the sandbox yet, not that the sandbox is missing something (HAL-12649). Before the engine starts a run, the agent host shall clear what ended runs left, keeping the folders of the runs that are still running or waiting. Where no agent host runs, a workflow with an agent in a harness shall be refused as `unavailable` like one with a connector; where the agent host can't be reached when the engine opens, the engine shall open without harnesses, say why through `reportError`, and a run of an agent in a harness shall fail at its harness step. A start (`startRun`) shall do those checks, open the engine, start the run on the saved files with the given input, and return the new run's id when the run has started, not when it ends (HAL-10237). Its runs shall keep to the `budget` of the workspace's `workspace.yaml`, as read when the engine opened, as `engine.budget-stops` says, so a budget set in the Studio stops the Studio's runs as it stops the CLI's. A routine's start (`startRoutine`) shall start the routine's workflow as a start does, with the routine's input and a manual trigger that names the routine, so Run now on the Routines page shows in the Runs list under the routine; a routine that starts an agent shall be refused as `unavailable` until agent runs are built (HAL-12171). The page's own refusals of an agent it can't start (a connector, or a harness with no agent host) shall be `WindowCantStart`, `unavailable` as before, so a caller can tell them from an engine that can't be reached.

## Examples

- Given a workspace no run has started in,
  when the page opens the workspace,
  then no lock is taken.
- Given the first send in a workspace,
  when the engine opens,
  then `engine_lock_hold` is called once and a second send reuses the engine.
- Given the CLI's engine holds the lock,
  when the page starts a run,
  then it is refused as `conflict` and no engine is built.
- Given no agent host and a workspace whose workflow has an agent in a harness,
  when the page checks it,
  then it is refused as `unavailable`, and the lock is never taken.
- Given the agent host runs and the workflow has an agent in Claude Code,
  when Claude Code asks for a person's OK through its bridge,
  then the engine's approvals of that run are asked, and a run with no approvals refuses it.
- Given an agent set to run on this computer,
  when its run reaches it in the Studio,
  then its session doesn't open and the program never starts.
- Given a workflow the window can run,
  when the Workflows page starts it with an input,
  then the engine starts the run and the page gets its id.
- Given a routine that starts a workflow the window can run,
  when Run now starts it,
  then the run records a manual trigger with the routine's key; for a routine that starts an agent it is refused as `unavailable`.
- Given the workspace changes,
  when the service closes,
  then the engine closes and `engine_lock_release` is called.
- Given a workspace whose `workspace.yaml` sets a monthly budget of 20 USD,
  when the engine opens,
  then its runs keep to that budget; with a `budget` that sets only a currency, they keep to none.
