# connector-stdio-sandbox.workspace-connector-profile

- Status: active
- Since: 0.1.0
- Source: HAL-2310 (D45, board yes on HAL-2257 Q3; decided by Liam on HAL-2303); Julian's condition 6 on HAL-4739, tracked on HAL-4759

The `workspaceConnectorPlace` function shall build the place a workspace's `stdio` connector runs in, for `localToolLaunch`, from the host's setting and the connector's stdio config only. The program shall write only to its own new working and temp folders. A program that isn't a pinned package shall read the workspace but not change it, and start in the workspace, or in the connector file's `cwd` there; a pinned package shall not read the workspace and shall start in its own working folder. Every harness agent's working folder shall be denied, with the host's other denied paths. The network shall be the bridge and the sites the connector file names, and none when it names none.

## Examples

- Given a script connector with the site `mail.acme.test` in a workspace with two harness agents,
  when its profile is built,
  then the workspace is read-only, both agents' working folders are denied, and `mail.acme.test` is the only allowed site.
- Given a pinned package,
  when its place is built,
  then it has no read-only paths and starts in its own working folder.
