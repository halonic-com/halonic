# app.chat-refusals

- Status: active
- Since: 0.1.0
- Source: HAL-1063; the refusals list of a connector's status in the library feature

When a model turn of a chat answer reports refusals, the chat service shall tell the answer's listener those refusals once, after the turn's assistant message, and shall not add them to the messages that go back to the model.

## Examples

- Given a listener and a model turn that refused one tool listing, then the listener hears that refusal once and the answer's messages hold only the assistant message.
- Given a model turn with no refusals, then the listener's `onRefusals` is not called.
