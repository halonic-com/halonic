# studio.workspace-connector-blocked

- Status: active
- Since: unreleased
- Source: HAL-11737 (split from HAL-11681); flow-library 8.1 and 8.2; UX check row L10 on HAL-11613

While the open workspace is local only (`privacy.localOnly` in its `workspace.yaml`), the desktop app's connector status shall mark each connector that isn't local as blocked, by the same rule the engine uses to leave it out of a run (`engine.local-only`): the connector's own `local` setting when its file has one, otherwise local for a program on this computer and for an HTTP server on a loopback address. A connector of a workspace that isn't local only, and a local connector, shall not be marked blocked. Being blocked shall not change the connector's state.

## Examples

- Given Acme is local only, with an MCP connector at `https://search.acme.example/mcp`, a local program connector and a Google connector,
  when the status lists them,
  then the MCP and Google connectors are blocked and the local program isn't.
- Given Acme is local only and its MCP connector's file says `local: true`,
  when the status lists it,
  then it isn't blocked.
- Given Acme is not local only,
  when the status lists its connectors,
  then none is blocked.
- Given Acme turns local only on while the Library shows,
  when the file changes,
  then the status tells its listeners and lists its cloud connectors as blocked.
