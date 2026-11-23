# server.chat-turn-stream

- Status: active
- Since: unreleased
- Source: HAL-17116, PR 3 of the streaming plan on HAL-17106 (approved on HAL-17113, with Liam's conditions)

When a `POST /api/chat-turn` request's `Accept` header names `application/x-ndjson`, the server shall answer the turn as a stream with `Content-Type: application/x-ndjson`: one JSON object per line, `{ "text": string }` for each piece of the answer's text as the model writes it, `{ "restart": true }` when the text so far is void because another model answers, and last either `{ "response": ChatTurnResponse }` or `{ "error": { code, message, reason? } }`, never both. Every check of `server.chat-turn` and `server.chat-turn-model-address` still comes first and answers with its own status, before any line. Once the stream has started, a failure of the turn travels only as the error line, with the same `model_call_failed` body the plain answer has (the `reason` of a `ModelCallError`, never its message or host), and its cause goes to the error log. The executor gets the request's `signal` joined with the stream's own: when the caller closes the request or stops reading the body, the host aborts the model call, logs no error and sends no last line. Without that header the route answers as `server.chat-turn` says and gives the executor no `onText`.

Rationale: a chat on the background engine should show the reply as it is written, as one on the page's own engine does, and an older caller that doesn't ask for a stream must keep working. Once the 200 is sent there is no status left to fail with, so the last line has to carry the outcome, and a stream that ends without one tells the caller the turn failed. Stopping a chat must stop the model call too, or the host keeps paying for an answer nobody reads.

## Examples

- Given an executor that writes `Hel`, restarts, writes `Hello ` and `there` and answers, when the request accepts `application/x-ndjson`, then the lines are `{"text":"Hel"}`, `{"restart":true}`, `{"text":"Hello "}`, `{"text":"there"}` and `{"response":…}`.
- Given a request without that header, then the answer is the response as JSON and the executor's request has no `onText`.
- Given an executor that writes `Half an` and then throws `ModelCallError("offline", "llm.internal didn't answer.")`, then the status is 200, the last line is `{"error":{"code":"model_call_failed","message":…,"reason":"offline"}}`, no line names `llm.internal`, and the error is logged.
- Given a workspace that changed, when the request accepts `application/x-ndjson`, then it answers 403 `workspace_not_trusted` and the executor is never asked.
- Given a stream that has sent its first line, when the caller closes the request, then the executor's `signal` is aborted, the stream ends without a last line and nothing is logged.
- Given a stream in progress, when the caller cancels the body, then the executor's `signal` is aborted.
