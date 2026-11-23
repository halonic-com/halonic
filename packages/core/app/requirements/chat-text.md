# app.chat-text

- Status: active
- Since: unreleased
- Source: HAL-17114, PR 1 of the streaming plan on HAL-17106, approved by Liam on HAL-17113

When the answer's listener has `onText`, the chat service shall give each model turn's request an `onText` that passes the executor's text deltas and restarts on to the listener as they come, so a chat can show the reply as it is written. The turn's assistant message shall still come through `onMessage` and stay the answer; the text is for display only and never goes back to the model. Without a listener's `onText`, the request shall have none. `ChatSettings` shall leave `onText` out, so the text has one way in. When `onText` throws, the answer shall end as failed with the listener's error, like the listener's other methods, even when the executor caught the error and answered. Once the person stopped the answer, no more text shall reach the listener.

## Examples

- Given a listener with `onTurn`, `onText` and `onMessage`, and a model turn that writes "Hel" and "lo",
  then the listener hears: turn 1, the delta "Hel", the delta "lo", then the message "Hello".
- Given a listener without `onText`,
  then the model turn's request has no `onText`.
- Given a listener whose `onText` throws, and an executor that catches the error and answers,
  then the answer ends as failed with the listener's error and adds no message.
- Given a model turn that writes "Before", then the person stops the answer, then it writes "After",
  then the listener hears only "Before" and the answer ends as stopped.
