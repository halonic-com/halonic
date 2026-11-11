# contracts.harness

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan, A1 (approved on HAL-1961); `Harness` port v1 and requirement `ports.harness-stream`; `signIn` from HAL-5395

Where an adapter implements `Harness`, its run's stream shall end with exactly one `agent.finished` for the task's agent, without a `parent` and with nothing after it, when its program finishes. If the program fails, the run is cancelled, or the program can't start, then the stream shall end with an error and no such `agent.finished`, and `cancel` shall resolve only once every program the run started has stopped. The adapter shall refuse `send` once the run has ended, and shall keep the bridge token out of every event and error. Where the adapter names a `signIn`, its `folderVariable` shall be one its `environment` sets to the profile's settings folder, so a sign-in lands where the agent's runs look for it. The suite runs the adapter against a fake sandbox session that keeps the `SandboxSession` promises: `start` throws once the session is closed or the fence isn't proven, `close` stops every program, and `exited` never rejects.

## Examples

- Given a harness whose program answers the prompt and exits,
  when its stream is read to the end,
  then the last event is the task agent's `agent.finished`, and it is the only one.
- Given a harness whose program fails with a message holding the bridge token,
  when the stream ends,
  then it ends with an error that doesn't contain the token.
- Given a harness whose program runs until stopped,
  when `cancel` resolves,
  then the program has stopped and the stream has ended with an error.
- Given a session that is already closed, or whose fence isn't proven,
  when the harness starts on it,
  then `start` returns at once, no program starts and the stream ends with an error.
- Given a run that has finished, failed or been cancelled,
  when a person sends an answer,
  then `send` refuses it, and `cancel` does nothing.
- Given a harness whose `signIn` names `CLAUDE_CONFIG_DIR`,
  when its environment is asked for with a profile's settings folder,
  then it sets `CLAUDE_CONFIG_DIR` to that folder.
- Given a harness that puts an `Error` holding the bridge token into an event,
  when the suite checks the events,
  then it finds the token, though `JSON.stringify` would show the `Error` as `{}`.
- Given a harness that puts a process error into an event or ends with one,
  and the error holds the bridge token in its own `stderr` field,
  when the suite checks the events and the error,
  then it finds the token.
