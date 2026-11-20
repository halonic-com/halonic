# studio.engine-service

- Status: draft
- Since: unreleased
- Source: HAL-10236, decided on HAL-10232; HAL-10849 and HAL-11378 for harness agents; `engine-lock-commands` of the shell (HAL-8792); `cli.local-engine`; the workspace's budget from HAL-11380; the send refusals for a held lock and a connector's call (HAL-13318, from checks C267 and C270), the connector named as the Library names it (HAL-13973, check C275 CW1)

When the page starts or sends a run for the first time in a workspace, the Studio shall open the workspace's engine: take the shell's engine lock with `engine_lock_hold`, then build the engine from the shell's run, blob and record stores, the keychain's secrets and the workspace's files, the same engine the CLI builds, so the CLI and the Studio read the same runs and timers. It shall keep the one engine, and its lock, until the service closes, when the workspace changes or the window closes, and then release the lock with `engine_lock_release`. It shall not take the lock before the first start or send. If another engine holds the lock, it shall refuse as `conflict` naming the other process; if the engine can't open, it shall give the lock back. It shall hold the lock through `TauriEngineLock`, with the channel on which the shell says the lock was lost; when the shell says so (another process took it over, say after the computer slept), it shall close the engine, as the CLI's engine closes on a lost lock, and say why through `reportError`, so no run goes on in two engines; the next start or send opens the engine afresh and asks for the lock again. It shall refuse as `unavailable`, before it opens the engine, a workflow with an agent that lists a connector, because the page can start none. Where the agent host runs, the engine shall run an agent in a harness with the agent host's parts (HAL-10849, the board's yes on HAL-11378): its fenced sandbox, its harnesses, its bridges, its profile builder, its proposal folders and its placement choices, while the recorder, the tools, the approvals and the keys stay in the page. Each bridge's approvals shall be the engine's own approvals of the agent's run, so a card decides them, and a phone's decision on one of the bridge's questions, which the agent host passes on marked `remote-device`, shall go to the engine's remote decisions of that run, so the first answer, from the card or the phone, wins; before the engine is built, and where it has none, they refuse every request and every phone's decision, and nothing is approved by default. An agent set to run on this computer shall be refused before its program starts, because the agent host has no unfenced session. Before the engine starts a run, the agent host shall clear what ended runs left, keeping the folders of the runs that are still running or waiting. Where no agent host runs, a workflow with an agent in a harness shall be refused as `unavailable` like one with a connector; where the agent host can't be reached when the engine opens, the engine shall open without harnesses, say why through `reportError`, and a run of an agent in a harness shall fail at its harness step. A send (`send`), an answer to a run waiting for a person such as an Inbox card's Approve or Reject, shall open the engine, refuse as `denied` a workspace that may start nothing, as a start does, since the run goes on from there, and pass the event, its payload and the tool call or wait step it answers to the executor, as `halonic runs send` does. While another engine holds the lock, a send shall fail as `unavailable`, not `conflict`, its sentence naming the other process and saying to close it, so the Inbox offers **Try again** instead of saying the run moved on. A send of `approve` for a tool call from a connector shall be refused as `unavailable` before anything is recorded, its sentence naming the connector as the Library does ("This window can't run tools from Notes yet. To approve this one, run this in a terminal:", its id when it has no name), with `halonic runs send <short id> approve` as its `fix`, because the page starts no connector and the run would fail at that call; the run keeps waiting, and a Reject or Ask for changes of that call goes to the executor. A start (`startRun`) shall do those checks, open the engine, start the run on the saved files with the given input, and return the new run's id when the run has started, not when it ends (HAL-10237). Its runs shall keep to the `budget` of the workspace's `workspace.yaml`, as read when the engine opened, as `engine.budget-stops` says, so a budget set in the Studio stops the Studio's runs as it stops the CLI's. A routine's start (`startRoutine`) shall start the routine's workflow as a start does, with the routine's input and a manual trigger that names the routine, so Run now on the Routines page shows in the Runs list under the routine; a routine that starts an agent shall be refused as `unavailable` until agent runs are built (HAL-12171): before the engine opens when the page couldn't run the agent in a workflow either, and otherwise when the engine is asked to start it. A harness run's instructions shall be written by the agent host, and the engine shall check them against the instructions the person trusted, which the shell keeps, so a run whose instructions aren't trusted doesn't start (`engine.harness-instructions-trust`).

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
- Given the agent host runs and Claude Code waits for a person's OK in a run,
  when a phone allows or denies it,
  then the decision goes to the engine's remote decisions of that run, and with none it is refused.
- Given the agent host runs and an agent in Claude Code has instructions and a skill,
  when its run starts,
  then the agent host writes them, and the engine checks them against the person's trusted instructions for this workspace.
- Given an agent set to run on this computer,
  when its run reaches it in the Studio,
  then its session doesn't open and the program never starts.
- Given a run waiting at a tool call,
  when the Inbox approves it,
  then the engine opens and the executor gets `approve` with that call's id; in a workspace that may start nothing it is refused as `denied`.
- Given a run waiting at a tool call from the connector `notes`, named "Notes",
  when the Inbox approves it,
  then it is refused as `unavailable`, "This window can't run tools from Notes yet. To approve this one, run this in a terminal:", with `halonic runs send <short id> approve`, nothing is sent and the run still waits; a Reject is sent.
- Given `halonic serve` holds the workspace's lock (process 4242),
  when the Inbox approves a waiting call,
  then it fails as `unavailable`: "This workspace is open in another engine (process 4242). Close it, then try again."
- Given a workflow the window can run,
  when the Workflows page starts it with an input,
  then the engine starts the run and the page gets its id.
- Given a routine that starts a workflow the window can run,
  when Run now starts it,
  then the run records a manual trigger with the routine's key; for a routine that starts an agent it is refused as `unavailable`.
- Given an open engine,
  when the shell says another process took the lock over,
  then the engine closes, `engine_lock_release` is called, and the next start takes the lock again.
- Given the workspace changes,
  when the service closes,
  then the engine closes and `engine_lock_release` is called.
- Given a workspace whose `workspace.yaml` sets a monthly budget of 20 USD,
  when the engine opens,
  then its runs keep to that budget; with a `budget` that sets only a currency, they keep to none.
