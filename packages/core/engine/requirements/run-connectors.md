# engine.run-connectors

- Status: active
- Since: 0.1.0
- Source: HAL-6277 and HAL-6290 (per-run connector port, modelled on `engine.run-proposal-folder`)

Where the host gives the local executor the connectors of top-level runs, when a step of a run needs a connector, the engine shall ask the host to open the connectors of the run's top-level run, with the version of the workspace that run's definitions were read from, and shall use only those for the step; a child run and a `foreach` item shall use their top-level run's. The engine shall open them lazily: not when the run starts, and not for a model call whose agent's file lists no connector, so a run that calls no connector opens none, and a run resumed after the host started again opens them again at its next step that needs one. When the host can't start them, the step that needed them shall fail: a model call fails the run with an error that names the agent, and a recorded connector call ends with the outcome `error` and the text that the connector isn't connected, without the call being made; neither shall stop the host or another run. When a top-level run ends, whether completed, failed, cancelled or interrupted when an engine next starts, the engine shall end its connectors after its harness calls have stopped and its proposal folder has ended; a child run's end shall not end them. When they open after their top-level run has ended, the engine shall end them again and not use them. Where the host gives no connectors of runs, every run shall use the executor's `connectors`, as before. In a local-only workspace (`engine.local-only`), the engine shall ask the host to start only the run's connectors that are `local`, and shall use none it is given that isn't.

## Examples

- Given a `reply` run whose `writer` lists `mail`, when the writer's model call is made, then the host opens the connectors of `run_1` at the commit `run.started` names, and the model is offered the tools of that `mail`, not of the executor's.
- Given the same run, when it completes, then the connectors of `run_1` end once.
- Given a `reply` run whose `writer` lists no connector, when it runs to its end, then no connector is opened.
- Given an `onboard` run whose `workflow` state runs `reply` as child run `run_1.2`, when the child's writer calls `mail`, then the connectors of `run_1` are opened, and they end once, when `run_1` ends.
- Given the host can't start the connectors, when the writer's model call is made, then the run fails with an error that names `writer`, and another run on the same executor still completes.
- Given a run that waits for a person's OK on `send_mail`, when the host starts again and the person approves, then the connectors of `run_1` are opened on the new host, and the call is made on them.
- Given a run waiting for that OK, when it is cancelled, then its connectors end.
- Given an executor without connectors of runs, when a run's writer calls `mail`, then the call goes to the executor's `connectors`.
- Given a local-only workspace and a host that gives a `mail` that isn't local and a `files` that is, when the writer's model call is made, then the host is asked for local connectors only, and the model is offered only the tools of `files`.
- Given a local-only workspace and a run that waits for a person's OK on `send_mail` of a `mail` that isn't local, when the person approves, then the call is refused as not offered, and `mail` is never called.
