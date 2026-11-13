# agent-host-client.connector

- Status: active
- Since: 0.1.0
- Source: HAL-2310; `apps/agent-host/README.md`, "Connectors over loopback"

The stand-in `stdio` connector factory shall give the engine a `ConnectorClient` for a program the agent host runs. The stand-in shall open the connector in the host with `POST /v1/connectors/open` on its first call, never before, and only once however many calls follow at the same time. The open request shall hold the connector as its file says it, the workspace folder, the agents' working folders and the trust grant, and the values of the secrets its own `secretEnv` names, and no sandbox profile. It shall refuse to open without a workspace folder or without a trust grant, and shall name the first secret that isn't set, in each case without calling the host. `listTools` and `callTool` shall use the host's id for the connector, pass the idempotency key on, and give the host's tools and text unchanged; a refusal shall throw the host's status, kind and message. `close` shall close the connector in the host once, do nothing for a connector that never opened, and count a connector the host no longer has as closed. A call after `close` shall throw.

## Examples

- Given a connector whose `secretEnv` names one secret,
  when its first tool call opens it,
  then the host gets that secret's value under the secret's name, and no other secret.
- Given two tool calls made at once on a connector that isn't open yet,
  when both run,
  then the host gets one `open` and both calls use its id.
- Given a connector with no trust grant,
  when it is listed,
  then it throws and the host is never called.
