# app.chat-waiting

- Status: active
- Since: unreleased
- Source: HAL-2212, approved on HAL-2212: the "Waiting for approval" group of a connector's status

When a model turn of a chat answer ends, the chat service shall tell the answer's listener the listed tools the turn left out because they wait for a person's approval, as the response's `waiting`, or an empty list when the response has none, so the listener always holds the current set. The chat service shall not add them to the messages that go back to the model.

## Examples

- Given a model turn whose `waiting` holds the tool `lookup` of `notes`,
  then the listener hears that one tool after the turn's assistant message and the answer's messages hold only the assistant message.
- Given a model turn without `waiting`,
  then the listener's `onWaiting` is called with an empty list.
