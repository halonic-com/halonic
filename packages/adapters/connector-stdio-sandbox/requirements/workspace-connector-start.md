# connector-stdio-sandbox.workspace-connector-start

- Status: active
- Since: 0.1.0
- Source: HAL-2310 (D45, board yes on HAL-2257 Q3; decided by Liam on HAL-2303); Mateo's answer on HAL-6884

A workspace's `stdio` connector that the host set up (`workspaceConnectors`) shall start its program in the context's sandbox session, in the place `workspaceConnectorPlace` builds, and offer every tool its server lists, as the trust grant covers them all. Before it reads a secret or looks up a pin, it shall run `refuseAgentFolderStart`. A script shall start in the workspace, or in the connector file's `cwd` there, and a pinned package in its own working folder. `WorkspaceStdioConnectorFactory` shall give a connector to the sandboxed factory when the context has a session, and to the unfenced factory only when it has none and the connector is not a plugin's local tool.

## Examples

- Given a script connector in a fenced session,
  when its tools are listed and one is called,
  then the program starts with the workspace as its start folder, and every tool the server lists is offered.
- Given a connector that runs `node files/agents/writer/server.js`,
  when it starts,
  then nothing starts and no secret is read.
- Given a host with no sandbox session and a workspace connector,
  when the factory creates it,
  then it starts as before, without a sandbox.
- Given a host with no sandbox session and a plugin's local tool,
  when the factory creates it,
  then it is refused.
