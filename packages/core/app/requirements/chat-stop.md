# app.chat-stop

- Status: active
- Since: 0.1.0
- Source: HAL-1539; `assistant.chat.stop` in req-assistant and flow-assistant 5.1 ("Stopped by you."), the agents flow 4.4

When the person stops an answer, the chat service shall start no further model turn and no further tool call, and end the answer as stopped. A model turn that answers after the stop shall be dropped, because `RunExecutor.chatTurn` can't cancel it. Each tool call of the current turn that didn't run shall get the result "Not run: the person stopped the chat.", so every tool call in the history has a result. The messages added before the stop shall be kept.

## Examples

- Given the Build chat is busy with its third model turn,
  when the person stops it,
  then no fourth turn starts, the third turn's answer is dropped, and the answer ends as stopped with the first two turns' messages.
- Given a model turn with tool calls `c1` and `c2`,
  when the person stops the answer while `c1` runs,
  then `c1` keeps its result, `c2` doesn't run and gets "Not run: the person stopped the chat.", and the answer ends as stopped.
- Given a turn limit of 1 and a model turn with tool calls `c1` and `c2`,
  when the person stops the answer while `c1` runs,
  then the answer ends as stopped, not with the turn limit.
- Given the person stopped before the answer began, then the model is not asked.
