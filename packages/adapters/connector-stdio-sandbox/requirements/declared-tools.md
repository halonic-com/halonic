# connector-stdio-sandbox.declared-tools

- Status: active
- Since: 0.1.0
- Source: HAL-1738 (plugins P5), plan rule 6; plugins ADR section 3: a local tool offers only the tools its manifest declares, in the manifest's words

The sandboxed stdio connector shall offer only the tools its server lists that the plugin's manifest declares, each with the manifest's description, `risk` and `untrusted` and the server's parameters. It shall leave out each tool the server lists that the manifest doesn't declare and report it by name to `onUndeclaredTool`, and it shall refuse to call a tool the manifest doesn't declare before it starts anything or sends the call.

## Examples

- Given a manifest that declares `read_note` and a server that lists `read_note` and `wipe_disk`,
  when the connector lists its tools,
  then it offers `read_note` with the manifest's description and reports `wipe_disk`.
- Given the same connector,
  when `wipe_disk` is called,
  then the call is refused and `session.start` is never called.
