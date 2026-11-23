# ports.chat-turn-text

- Status: active
- Since: unreleased
- Source: HAL-17114, PR 1 of the streaming plan on HAL-17106, approved by Liam on HAL-17113; an optional field keeps `RunExecutor` version 1

The `ChatTurnRequest` of `RunExecutor.chatTurn` shall take an optional `onText` listener that hears a `ChatTurnText`: a `delta` with the `text` the model just wrote, or a `restart`, which means the text so far was thrown away. An executor that doesn't stream shall still satisfy the port.

The port's documentation shall state that the text is for display only and the response stays the answer, that after the last `restart` the deltas add up to the response's `content`, that the listener is never sent over the wire, and that harness turns don't stream yet.

## Examples

- Given a `ChatTurnRequest` with an `onText` listener,
  when it is given a delta and a restart,
  then it hears both, in order.
- Given a `ChatTurnRequest` without `onText`,
  when it is compiled,
  then it compiles, so existing callers are unchanged.
- Given a `ChatTurnText` that is a `delta` without `text`, or of another kind,
  when it is compiled,
  then it doesn't compile.
