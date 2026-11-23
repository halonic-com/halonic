# executor-remote.chat-turn-stream

- Status: active
- Since: unreleased
- Source: HAL-17116, PR 3 of the streaming plan on HAL-17106 (approved on HAL-17113, with Liam's conditions)

When a chat turn has `onText`, the client shall send `POST /api/chat-turn` with `Accept: application/x-ndjson`, and when the host answers with that content type, it shall read the answer line by line (`server.chat-turn-stream`): each `text` line goes to `onText` as a `delta` and each `restart` line as a `restart`, as they arrive; a `response` line resolves the turn, and an `error` line rejects it as a refused turn does (a `ModelCallError` for a known `reason` of `model_call_failed`, else a `RemoteHostError` with status 502). A body that ends before a response or error line, a line that isn't one of these, or a line longer than 16 MiB rejects the turn, so it counts as failed. When `onText` throws, the client stops reading the body, which closes the request, and the turn rejects with what it threw. When the answer's content type isn't `application/x-ndjson`, as from an older host, the client reads the whole answer as before and `onText` hears nothing. A turn without `onText` asks for no stream.

Rationale: a chat on the background engine should show the reply as it is written, and still work against a host that predates the stream. Once the host has sent its 200 it can report a failure only on the last line, so a stream without one must not pass as an answer.

## Examples

- Given a host that streams `Hel`, a restart, `Hello `, `there` and a response, then `onText` hears `delta Hel`, `restart`, `delta Hello `, `delta there`, and the turn answers the response.
- Given a turn without `onText`, then the request has no `Accept` header.
- Given a turn with `onText` and a host that answers plain JSON, then the turn answers it and `onText` heard nothing.
- Given a stream of `Half an` and then an error line with `reason` `offline`, then the turn rejects with a `ModelCallError` whose reason is `offline`, after `onText` heard `Half an`.
- Given a stream that ends after a text line, or in the middle of its response line, then the turn rejects with a `RemoteProtocolError`.
- Given an `onText` that throws, then the turn rejects with that error and the body is cancelled.
- Given a turn whose `signal` is aborted mid-stream, then the turn rejects with the signal's reason.
