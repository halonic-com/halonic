# ports.chat-turn-result

- Status: active
- Since: 0.1.0
- Source: decided on HAL-1061 for the local chat turn loop; optional output fields keep version 1

The `RunExecutor` port's `ChatTurnResponse` shall let an executor return every assistant and tool message a chat turn added, ending with its last answer (`turn`), and what the turn refused (`refusals`), each refusal naming its source, the tool where there is one, what was refused (`listing`, `tool`, `keyword` or `call`) and why. Both fields shall be optional, so a response without them still satisfies the port.

The documentation of `chatTurn` shall state which tools run inside the turn and which go back to the caller, how the turn ends at the round limit, and that a refusal comes back as data.

## Examples

- Given a `ChatTurnResponse` with only `model` and the `ChatResponse` fields,
  when it is compiled,
  then it compiles.
- Given a `ChatTurnResponse` with a tool message in `turn` and a refused call in `refusals`,
  when a status view reads it,
  then it gets the source, the tool name, `call` and the reason.
- Given a `ChatTurnRefusal` whose `refused` is `approval`,
  when it is compiled,
  then it doesn't compile.
