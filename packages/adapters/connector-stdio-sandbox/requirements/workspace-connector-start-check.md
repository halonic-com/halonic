# connector-stdio-sandbox.workspace-connector-start-check

- Status: active
- Since: 0.1.0
- Source: HAL-2310; Julian's condition 7 on HAL-4739, tracked on HAL-4759

Before a workspace's `stdio` connector starts in a sandbox session, `refuseAgentFolderStart` shall run the working folder check `format.working-folder-start` on the start folder, the program, its arguments and the `env` the connector file writes, and again on the program as found on the session's `PATH`, with the same shared check the start on this computer uses. It shall refuse a start that would run or load a file from a harness agent's working folder, naming that folder.

## Examples

- Given a connector that runs `node files/agents/writer/server.js`,
  when its start is checked,
  then it is refused, naming the working folder `files/agents/writer`.
- Given a connector whose program is found on the `PATH` in an agent's working folder,
  when its start is checked,
  then it is refused.
- Given a connector that runs `node tools/mail.js`,
  when its start is checked,
  then it may start.
