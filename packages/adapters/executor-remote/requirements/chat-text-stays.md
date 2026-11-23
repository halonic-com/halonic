# executor-remote.chat-text-stays

- Status: active
- Since: unreleased
- Source: HAL-17114, PR 1 of the streaming plan on HAL-17106; Liam's condition on HAL-17113 that whatever serialises a `ChatTurnRequest` picks `onText` off on purpose

The remote executor shall leave a chat turn's `onText` out of the body it sends to `POST /api/chat-turn`, by taking it off the request itself rather than relying on `JSON.stringify` to drop a function, so the host, which refuses a body with fields it doesn't take, still answers the turn. Until the host streams a chat turn, the listener shall hear nothing, and the turn shall be answered whole as before.

## Examples

- Given a chat turn whose `onText` listener also has a `toJSON` method,
  when the remote executor sends it,
  then the body holds only `hubId`, `messages` and `tools`, the answer is the host's, and the listener heard nothing.
