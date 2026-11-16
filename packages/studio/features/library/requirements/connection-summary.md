# library.connection-summary

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (P8c); flow-library 5.4 and 3.3, microcopy 11.2 (`library.connectors.connection-summary`)

The Library feature shall show, on a connector's page between its name and its status, a "How it connects" section with plain rows: the transport as the New connector dialog words its ways ("MCP over HTTP", "Local program (stdio)", "Gmail and Google Drive (built in)"), where it connects (the account, the URL, the command with its arguments, or the folder or plugin id), and "Secrets" with the secrets' names separated by commas, or "none". It shall show a secret's name only, never a value. It shall show no such section when the host gives no connection for the connector. The section shall draw no landmark.

## Examples

- Given an HTTP connector at https://search.acme.example/mcp with the secret `search-token`,
  when its page shows,
  then it shows "MCP over HTTP", the URL, and "Secrets" with `search-token`.
- Given a local program connector that starts `npx -y @acme/notes-mcp` with `NOTES_TOKEN` in its `secretEnv`,
  when its page shows,
  then it shows "Local program (stdio)", the whole command, and `NOTES_TOKEN`.
- Given a Google connector for fin@acme.example,
  when its page shows,
  then it shows the "Account" row and "Secrets" as "none".
- Given a connector whose file can't be read,
  when its page shows,
  then it shows no "How it connects" section.
