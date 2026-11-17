# studio.engine-service

- Status: draft
- Since: 0.1.0
- Source: HAL-10236, decided on HAL-10232; `engine-lock-commands` of the shell (HAL-8792); `cli.local-engine`; the workspace's budget from HAL-11380

When the page starts or sends a run for the first time in a workspace, the Studio shall open the workspace's engine: take the shell's engine lock with `engine_lock_hold`, then build the engine from the shell's run, blob and record stores, the keychain's secrets and the workspace's files, the same engine the CLI builds, so the CLI and the Studio read the same runs and timers. It shall keep the one engine, and its lock, until the service closes, when the workspace changes or the window closes, and then release the lock with `engine_lock_release`. It shall not take the lock before the first start or send. If another engine holds the lock, it shall refuse as `conflict` naming the other process; if the engine can't open, it shall give the lock back. In 0.1 it shall refuse as `unavailable`, before it opens the engine, a workflow with an agent in a harness or an agent that lists a connector, because the page can start neither. A start (`startRun`) shall do those checks, open the engine, start the run on the saved files with the given input, and return the new run's id when the run has started, not when it ends (HAL-10237). Its runs shall keep to the `budget` of the workspace's `workspace.yaml`, as read when the engine opened, as `engine.budget-stops` says, so a budget set in the Studio stops the Studio's runs as it stops the CLI's.

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
- Given a workspace whose workflow has an agent in a harness,
  when the page checks it,
  then it is refused as `unavailable`, and the lock is never taken.
- Given a workflow the window can run,
  when the Workflows page starts it with an input,
  then the engine starts the run and the page gets its id.
- Given the workspace changes,
  when the service closes,
  then the engine closes and `engine_lock_release` is called.
- Given a workspace whose `workspace.yaml` sets a monthly budget of 20 USD,
  when the engine opens,
  then its runs keep to that budget; with a `budget` that sets only a currency, they keep to none.
