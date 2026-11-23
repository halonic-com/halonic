# agent-host.engine-listener

- Status: active
- Since: unreleased
- Source: HAL-14217; HAL-17004; design note D3 on HAL-14206; security review on HAL-14212

The engine role's listener shall listen only on `127.0.0.1`, on a port the system picks, and shall hand every request to the engine server, which refuses a wrong `Host` with 421, any `Origin` with 403 and a missing or wrong launch token with 401 before it looks at the path. The listener shall use the agent host's own limits: the time to receive a request's headers and the whole request, the cap on open connections, and the largest request body. A test shall run the shared launch-token refusal contract against the listener over a real socket.

## Examples

- Given the engine role's listener,
  when a request without the token reaches its port over a socket,
  then the answer is 401, whatever the path.
- Given the engine role's listener,
  when a request with the token and any `Origin` header reaches it,
  then the answer is 403.
- Given the engine role's listener,
  when a request names another host in its `Host` header,
  then the answer is 421.
- Given a listener with as many connections open as its cap allows,
  when one more connection is made,
  then it is dropped.
