# server.outside-run-connector-gate

- Status: active
- Since: 0.1.0
- Source: HAL-195 (build plan PR 6, host side); the check itself is `app.outside-run-connector-gate`; HAL-9 plan item 11

The server shall let a signed-in caller call one connector tool from outside a run with `POST /api/connector-calls`, and shall run no such call without asking `checkOutsideRunCall` from `core/app` first, for every call. The JSON body is `{ "connector": string, "tool": string, "arguments": object }`; a body with any other field, or a name that is empty or longer than 256 bytes, answers 400 `bad_request`. The connector and tool names are caller text: the host looks them up in its own list and never reads them as a path. The route needs a sign-in when a password is set, passes the same `Host` and `Origin` checks, body limit and daily request ceiling as every route, refuses a `Content-Type` other than `application/json` with 415 `unsupported_media_type`, and needs a trusted workspace like a start (403 `workspace_not_trusted`). A host that offers no connector calls leaves `connectors` out, and the route answers 404. The host's port only finds the tool and runs it; the server calls the gate between the two and passes the gate only the read side of the settings, so a port can't skip the gate and nothing here can switch sending on. A tool the host doesn't offer answers 404 `connector_tool_not_found`. A call the gate refuses answers 403 `connector_call_refused` with the gate's reason, and the tool never runs; when the connector's settings couldn't be read, the store's error goes to the error log and never to the caller. A tool that throws answers 502 `connector_call_failed` with a fixed message, and the cause goes to the error log. A caller that closes the request answers 499 `request_aborted`, and the abort isn't logged.

Rationale: outside a run nobody can approve a call, so a route that ran any tool the caller names would let a served Studio, a page or a script reach a connector past every check a run applies. It must run only what a run would run without asking: a `read` tool the connector's lists allow, with arguments its parameters declare.

## Examples

- Given a `read` tool and a signed-in caller, when `POST /api/connector-calls` names it with declared arguments, then the tool runs and the result is answered.
- Given a `write` tool that isn't under `approve`, when it is called, then it answers 403 `connector_call_refused` and `call` is never reached.
- Given a `send` tool with sending switched on, when it is called, then it is still refused.
- Given a tool under `approve`, or one the `allow` list leaves out, when it is called, then it is refused.
- Given a `read` tool and an argument its parameters don't name, when it is called, then it is refused.
- Given a `send` tool whose settings can't be read, when it is called, then the reason says sending is off, the caller's body has no path or error text, and the error is logged.
- Given a workspace that isn't trusted, or no session on a server with a password, when a call arrives, then it is refused and the host isn't asked to find the tool.
- Given a form POST with no `Origin`, when it reaches the route, then it answers 415 and nothing is found or run.
