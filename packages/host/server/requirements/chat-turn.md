# server.chat-turn

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 10c, remote run executor); PR 10 plan approved on HAL-9093

The server shall let a signed-in caller ask for one model turn outside any run with `POST /api/chat-turn`. The JSON body is `{ "hubId": string, "messages": ChatMessage[], "tools": ToolDefinition[], "alias"?: string, "agentId"?: string, "params"?: ChatParams, "agent"?: ChatAgentSettings }`, and the answer is the executor's `ChatTurnResponse` as JSON. The route needs a sign-in when a password is set, passes the same `Host` and `Origin` checks, body limit and daily request ceiling as every route, and refuses a body whose `Content-Type` isn't `application/json` with 415 `unsupported_media_type`. A body that isn't one of the above, or that has any field the shapes don't list (including a `signal`), answers 400 `bad_request` before the executor is asked; the server builds the executor's request from the listed fields only. The `agent` settings carry only the **name** of the secret that holds the API key (`secret`): a field such as `apiKey` refuses the request, and a name that isn't a valid secret name, belongs to Halonic (such as the sign-in password's hash) or to a plugin answers 400 `secret_name_not_allowed`, because the host sends the secret's value to `baseUrl`. A chat turn needs a trusted workspace, as a start does, because the executor runs the tools it calls: with any other state it answers 403 `workspace_not_trusted` and the executor is not asked. The request's `signal` goes to the executor, so when the caller closes the request the host aborts the model call; the abort is not logged as an error and answers 499 `request_aborted`. Any other failure of the turn answers 502 `model_call_failed` with a fixed message, and the cause goes to the error log, never to the caller. No route grants trust.

Rationale: a remote caller needs the same chat the local one has. A key must never travel or be stored in a request, and the caller must not be able to make the host send one of its own secrets to a server the caller picks. Stopping a chat must stop the model call too, or the host keeps paying for an answer nobody reads.

## Examples

- Given a valid body, when `POST /api/chat-turn` arrives signed in, then the executor gets the same request plus the request's `signal`, and its response comes back.
- Given `agent.apiKey` in the body, then it answers 400 and the executor is never asked.
- Given `agent.secret` `serve-password`, then it answers 400 `secret_name_not_allowed`.
- Given a form POST (`application/x-www-form-urlencoded`) with a valid session cookie and no `Origin`, then it answers 415 and the executor is never asked.
- Given a workspace that changed, then it answers 403 and the executor is never asked.
- Given a turn in progress, when the caller aborts the request, then the executor's `signal` is aborted and the server logs no error.
- Given an executor that throws `Error("key sk-abc rejected by https://llm.internal")`, then the caller gets 502 `model_call_failed` and the body names neither the key nor the host.
- Given no session on a server with a password, then it answers 401 and the executor is never asked.
