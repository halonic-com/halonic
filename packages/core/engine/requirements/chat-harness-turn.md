# engine.chat-harness-turn

- Status: active
- Since: 0.1.0
- Source: HAL-189, 4f as amended after Liam's decision on HAL-3789

When the engine runs a chat turn in a harness program (Claude Code or Codex), it shall run the turn as one harness call in the agent's sandbox, with the same sandbox, bridge and start limits as a run's harness call, and answer with the agent's result. Each message shall start a new harness call, whose prompt carries the earlier messages of the person and the agent before the new message; the caller's tools shall not be offered to the harness. The turn shall report the model that answered last and the usage of every model call through the bridge, and keep no run log.

A chat turn can't wait for a person, so when the harness asks for an approval, the engine shall answer it with `approved: false` and a short comment, and report a `ChatTurnRefusal` with `refused: "call"`. When the request's `signal` aborts, the engine shall stop the harness run, close its sandbox session and bridge, and reject once all three have stopped. When the engine stops while a chat turn's harness call is going on, it shall stop that call in the same order as a run's (`engine.harness-stops-with-engine`), the turn shall reject, and later chat turns in a harness shall be refused.

## Examples

- Given a chat with agent `writer`, whose file names `claude-code`,
  when the person sends "Draft a reply to support" and the agent finishes with "Dear support",
  then the turn answers "Dear support", with the bridge's model and usage, and everything the call started has stopped.
- Given that chat, when the harness asks to approve `Bash`,
  then the harness gets `approved: false`, and the turn's refusals list `Bash` as a refused call.
- Given that chat while the agent works,
  when the person stops the chat,
  then the harness run is cancelled, its sandbox and bridge are closed, and the turn rejects.
- Given that chat while the agent works,
  when the host closes the engine,
  then the harness run is cancelled, its sandbox and bridge are closed, and the turn rejects.
