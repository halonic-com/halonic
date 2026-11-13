# Decision: the stand-in connector factory for the agent host

- Approval: Paperclip task HAL-2310 (D45, board on HAL-2257 Q3); Liam's decision on HAL-8403, part (b); Liam approves this note in review
- Kind: internal

Studio's engine runs in a page that can't start programs, so `agent-host-client` gets an `AgentHostConnectorFactory`: a `stdio` `ConnectorFactory` whose clients call the host's `/v1/connectors/*` routes (HAL-2310-06). The shell's route table gets the same four routes, as the shell-routes test requires.

- The connector opens in the host on its first call, once however many calls run at the same time, and a refused open can be tried again.
- The request carries the connector's file fields, the workspace folder, the agents' working folders and the trust grant. It never carries a sandbox profile.
- Studio keeps the secrets: the stand-in reads only the ones the connector's own `secretEnv` names and sends their values; a secret that isn't set fails the call before the host is reached.
- No trust grant or no workspace folder fails the call without calling the host.
- `close` closes it in the host once; a connector the host no longer has counts as closed.

## Covers

- agent-host-client.connector
