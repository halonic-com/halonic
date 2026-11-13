# connector-stdio-sandbox.workspace-connector-session

- Status: active
- Since: 0.1.0
- Source: HAL-2310 (D45, board yes on HAL-2257 Q3); Liam's decision on HAL-8403

The `stdio` factory of a host that opens its workspace connectors' sessions itself (`SessionWorkspaceFactory`) shall, on a connector's first call, check the sandbox. When it works, the factory shall build the session's profile itself, with `workspaceConnectorPlace` and `localToolLaunch`, from the connector file, its own new folders and the context's workspace and agent working folders, open the session with that profile and start the connector in it. When it doesn't, the connector shall start as before, without a sandbox. A session that has ended shall be closed and the next call shall open a new one with new folders. Closing the connector shall close its session and remove its folders.

## Examples

- Given a sandbox that works and a script connector with `sites`,
  when a tool is listed,
  then the session opens with the workspace read-only, every agent working folder denied, only the connector's own `env` and secrets, and only its sites, and the program starts in it.
- Given a sandbox that doesn't work,
  when a tool is listed,
  then the connector starts as before, and no session opens.
- Given a session that has ended,
  when the next call comes,
  then a new session opens with new folders.
- Given an open connector,
  when it closes,
  then its session closes and its folders are removed.
