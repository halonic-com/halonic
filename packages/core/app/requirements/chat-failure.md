# app.chat-failure

- Status: active
- Since: 0.1.0
- Source: HAL-1539; `agents.chat.retry-failed-message` in req-agents and flow-assistant 5.9 ("Try again" only before a tool ran; "Some tool calls already ran. Send a new message to continue.")

If a model turn fails, then the chat service shall end the answer as failed with the error, keep the messages added before it, and say whether a tool was called in that answer, even one that then failed, so the chat offers "Try again" only when sending the message again can't repeat a tool call. A call of a tool the chat doesn't offer shall not count, because nothing ran. If the answer's listener throws, then the chat service shall end the answer the same way, as failed with the listener's error.

## Examples

- Given the model can't be reached on the first turn,
  then the answer ends as failed with that error, no tool ran, and no messages were added.
- Given `read_file` ran in the first turn and the model can't be reached on the second,
  then the answer ends as failed, a tool ran, and the call and its result are kept.
- Given the only tool call in the first turn named a tool the chat doesn't offer and the second turn fails,
  then no tool ran.
- Given `send_mail` ran in the first turn and the listener throws when it hears the tool result,
  then the answer ends as failed with the listener's error, a tool ran, and the call and its result are kept.
