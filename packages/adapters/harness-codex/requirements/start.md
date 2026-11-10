# harness-codex.start

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D3; HAL-3998; `Harness` port v2

The Codex harness shall start a run by writing `config.toml` to the agent's settings folder and then starting `codex app-server` in the run's sandbox session, with the bridge's address as `-c` settings. It shall open the conversation, start an ephemeral thread in the session's working folder, with the agent's model and its instructions as developer instructions when its file sets them, and start a turn with the task's prompt; neither the prompt nor the instructions shall be in the arguments. The run's events shall be what the reader makes of Codex's notifications. Once the task's turn has completed, the harness shall stop Codex and everything it started before the final `agent.finished` is read; if the session can't stop Codex, then the run shall end with that error, without the bridge token, instead. `send` shall pass a person's answer into the running turn (`turn/steer`), and a decision on an `approval.requested` back to its request. A request for an OK shall go as `harness-codex.approvals` says, and any other request Codex sends shall be answered with an error, so Codex never waits for an answer no one will give. When Codex ends before the turn completed, the run shall end with an error that says how it ended, with the last line of its standard error but never the bridge token; when Codex prints a line that isn't JSON-RPC, the run shall end with an error and Codex shall be stopped. If the profile has no settings folder, then the run shall end with an error and start nothing.

## Examples

- Given a run of an agent whose file sets the model "gpt-5.5" and instructions,
  when it starts,
  then `config.toml` has been written, `thread/start` names the working folder, the model and the instructions, and `turn/start` carries the prompt.
- Given Codex asks for an OK to run `touch a`,
  when a person approves it,
  then the stream has had `approval.requested` for `shell`, and Codex gets `accept` as the answer to its request.
- Given a run waiting on Codex,
  when a person's answer is sent,
  then Codex gets it with `turn/steer` for the running turn.
- Given Codex exits with 1 after printing the bridge token on standard error,
  when the run ends,
  then the error says it stopped with exit code 1 and doesn't contain the token.
- Given a turn that completed, and a session that fails to stop Codex,
  when the run ends,
  then the stream ends with the session's error instead of `agent.finished`.
