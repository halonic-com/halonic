# harness-codex.app-server-client

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D2; HAL-3587 (protocol checked with `codex app-server generate-json-schema` and a recorded session of Codex 0.166.0)

The Codex harness shall talk JSON-RPC with `codex app-server` over its standard input and output, one JSON object per line, without the `jsonrpc` field, as Codex does. It shall open with the `initialize` request, then the `initialized` notification. It shall match each answer to its request by id, in any order, and fail a request Codex answers with an error, with Codex's message and code. Notifications and requests Codex sends on its own shall be handed on in order, and an answer to a request it didn't send shall be ignored. It shall answer Codex's requests with a result or an error. When Codex's output ends, every waiting and later request shall fail. A line that isn't a JSON-RPC message, or longer than 16 MiB, shall stop the reading with an error that doesn't quote it. No error shall contain the bridge token.

## Examples

- Given Halonic starts the conversation,
  when the client opens it,
  then Codex receives `initialize` with Halonic's client info and, after the answer, `initialized`.
- Given Codex answers `turn/start` with `{"code": -32600, "message": "no thread"}`,
  when the request settles,
  then it fails with "Codex refused `turn/start`: no thread (-32600)".
- Given Codex's output ends while `turn/start` waits,
  when the request settles,
  then it fails with "Codex's app-server stopped before it answered `turn/start`."
- Given Codex prints a line that isn't JSON and holds the bridge token,
  when it is read,
  then the reading stops with an error that doesn't contain the token.
