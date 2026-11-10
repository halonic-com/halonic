# engine.run-harness

- Status: active
- Since: 0.1.0
- Source: HAL-189, stacks 4b and 4d of its implementation plan (Liam's reviews on HAL-1967 and HAL-3283)

When the engine carries out a harness run for a task state's agent, it shall ask the placement policy where the agent runs, and use the sandbox for that placement: the fenced sandbox, or the launcher's session when a person chose this computer for the agent's file as it is now. When that sandbox's check isn't `ok`, the engine shall fail the step with the check's reason code before it opens or starts anything, and shall never run the harness without its sandbox. Otherwise it shall open the run's bridge, build the sandbox profile and add the harness's own environment variables to it, record `sandbox.started`, open the sandbox, record `sandbox.opened`, record `harness.started`, start the harness with the agent's instructions, model and the state's prompt, and record each event the harness or the bridge reports, with the state added to the events that have one. The `output` of the agent's own `agent.finished` shall be the step's result. When the harness call ends, in any way, the engine shall stop the harness run, then close the sandbox session, then close the bridge. It shall end the harness's event stream once the harness run has stopped, so a harness's own clean-up runs, and the step shall end only once every event the harness and the bridge reported is in the log. When another writer adds to the run's log while the harness runs, the engine shall write the harness's next events after it as long as the run still waits on the harness call, and shall stop writing once it doesn't.

## Examples

- Given a `writer` agent in Claude Code, placed in a sandbox whose check is `ok`,
  when its harness reports a `tool.called` and then its own `agent.finished` with `On its way`,
  then the log gets `sandbox.started`, `sandbox.opened`, `harness.started` and `tool.called`, the result is `On its way`, and the harness, the session and the bridge are stopped in that order.
- Given the same agent, when the sandbox check gives `bubblewrap-missing`,
  then the step fails with an error that names `bubblewrap-missing`, nothing is recorded, and no bridge, sandbox or program is started.
