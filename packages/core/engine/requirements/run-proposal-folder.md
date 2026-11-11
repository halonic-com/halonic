# engine.run-proposal-folder

- Status: active
- Since: 0.1.0
- Source: HAL-4776, the harness side of HAL-3248 (run proposals); `app.run-proposal-branch`, `app.run-proposal-worktree` and `app.run-proposal-end` in `core/app`

Where the host gives the local executor proposal folders, when a top-level run starts and any agent among its definitions runs in a program harness, with the run's own `harness` in place of the one each file names, the engine shall open the run's proposal folder before it records the run's start, and shall not start the run when the folder can't be opened. Each harness call of the run and of the child runs under it, a `foreach` item's included, shall get that one folder as the agent's `filesFolder`, where the host's profile builder resolves the agent's working folder in place of the workspace. When the top-level run has no open folder, the harness call shall fail before it opens a bridge or a sandbox, so the agent never writes in the workspace. When a top-level run ends, whether completed, failed, cancelled, can't-try or interrupted when an engine next starts, the engine shall stop every harness call still going on in the run and its child runs, and only then end the folder; a cancel ends it once the run and its child runs are cancelled. A child run's end shall not end the folder. A run none of whose agents runs in a program harness shall get no folder, and its end shall end nothing that exists.

## Examples

- Given a `reply` run whose `writer` agent names `claude-code`,
  when it starts, then the folder of `run_1` is opened before `run.started` is recorded,
  and the writer's sandbox profile has its working folder in that folder, at `files/agents/writer`.
- Given the same run, when the writer's harness finishes, then the folder of `run_1` ends after the sandbox session has closed.
- Given an `onboard` run whose `workflow` state runs `reply` as child run `run_1.2`,
  when the child's writer runs, then it works in the folder of `run_1`, one folder is opened,
  and the folder ends once, after `run_1` has ended.
- Given a `reply` run whose `writer` names no harness, when it starts, then no folder is opened.
- Given the same `writer` and a start with `harness: "codex"`, when it starts, then a folder is opened.
- Given a `reply` run whose writer's harness is still running, when the run is cancelled,
  then the harness, its session and its bridge stop before the folder ends, and the run ends as cancelled.
- Given the host can't open the folder, when the run starts, then the start throws and no run is recorded.
- Given the folder of `run_1` is gone while the run still runs, when the writer's harness call is carried out,
  then the run fails with an error that says it has no folder to write files in, and no sandbox is opened.
- Given an engine stopped while the writer's harness ran, when an engine next starts on the store,
  then `run_1` ends as interrupted and its folder ends.
