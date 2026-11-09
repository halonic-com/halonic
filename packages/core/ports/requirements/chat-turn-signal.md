# ports.chat-turn-signal

- Status: active
- Since: 0.1.0
- Source: HAL-1771, the review of HAL-1539: Stop in a chat should cancel the model turn, not only drop its answer; an optional field keeps `RunExecutor` version 1

The `ChatTurnRequest` of `RunExecutor.chatTurn` shall take an optional `signal`, an `AbortSignal` that is aborted when the person stops the chat. An executor that ignores it shall still satisfy the port, so the caller keeps dropping an answer that comes after the abort.

The port's documentation shall state that the signal is never sent over the wire and that an executor that honors it rejects the turn.

## Examples

- Given a `ChatTurnRequest` with an `AbortSignal` as `signal`,
  when it is compiled,
  then it compiles.
- Given a `ChatTurnRequest` without a `signal`,
  when it is compiled,
  then it compiles, so existing callers are unchanged.
- Given a `ChatTurnRequest` whose `signal` is a boolean,
  when it is compiled,
  then it doesn't compile.
