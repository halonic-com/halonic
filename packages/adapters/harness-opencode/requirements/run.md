# harness-opencode.run

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan, step 4: the run); HAL-18176

When an OpenCode run is asked for and no refusal of `harness-opencode.refusals` applies, the OpenCode harness shall leave only the update policy and the model catalog in the agent's settings folder, write the session's instructions file, start `opencode run` in the sandbox session and write the task's prompt to its standard input, then close it. It shall turn each line OpenCode prints into run events, and end the run with `agent.finished` only once OpenCode has exited with code 0. When OpenCode exits any other way, the run shall end with an error that says how it ended and gives the last line of its standard error. When the run is cancelled, the harness shall stop OpenCode and everything it started and end the run with "The OpenCode run was cancelled.", unless stopping failed, which ends it with that error. No file the harness writes shall hold the run token, and no error shall hold it.

## Examples

- Given an agent with `asks: in-sandbox` in a fenced session on Linux and the recorded 2.3.0 run,
  when OpenCode exits with code 0,
  then the run ends with `agent.finished` saying "The file says hello from acme.".
- Given a run against a scripted bridge,
  when it has ended,
  then no file in the agent's settings folder holds the run token.
- Given OpenCode exiting with code 1 after printing "bridge refused the token" to standard error,
  when the run ends,
  then the error says "OpenCode stopped with exit code 1 before it finished: bridge refused the token".
