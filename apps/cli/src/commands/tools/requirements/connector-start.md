# cli.commands.tools.connector-start

- Status: active
- Since: unreleased
- Source: HAL-13670 (from Nina's C207 note on HAL-13667: a missing program read as "a problem it can't explain yet"); the words of Studio's connector failures (UX check C2, HAL-12410); HAL-13714 (from the real-run QA pass on HAL-13712: a server that isn't running read the same way); the words for a missing program or secret decided on HAL-13829 (CN3 of the C248 check on HAL-13818)

When the connector that `halonic tools review` or `halonic tools approve` starts to list its tools can't start because its program isn't on this computer, the command shall stop with line 1 "Couldn't list the tools from <connector>: its program <program> isn't on this computer." and the fix "Install it, or change the command in <file>.", with the connector's file named by its path, or as "the <connector> connector file" when it has no file in the workspace, and exit 9 (`unavailable`). When a secret the connector names isn't set, it shall stop with line 1 "Couldn't list the tools from <connector>: it needs the secret <name>, which isn't set." and the fix "Set it with: halonic secret set <name>", and exit 2 (`invalid_input`). It shall tell the two apart by the error's type, never show the error's own text, and give `--json` the cause and the name as `reason` with `program` or `secret`. When nothing answers at an `http` connector's address (Node's network codes, such as `ECONNREFUSED`), it shall stop with line 1 "Nothing answered at <address>.", the address without a user name, password, query or fragment, and a fix that says to start its server or change the address in the connector's file; when the server stopped, or didn't answer in time, before it listed its tools, line 1 shall be "The <connector> server stopped, or didn't answer in time, before it listed its tools." with a fix that says to check its server on its own. Both exit 9 (`unavailable`), and `--json` gets `reason` `nothing-answered` with `address`, or `stopped`.

## Examples

- Given `notes-mcp`'s command names `notes-nope`, which isn't on this computer,
  when `halonic tools review notes-mcp` runs,
  then it prints "✕ Couldn't list the tools from notes-mcp: its program notes-nope isn't on this computer." and "Install it, or change the command in library/connectors/notes-mcp.connector.yaml." and exits 9.
- Given the same,
  when `halonic tools approve notes-mcp archive --json` runs,
  then the error has kind `unavailable`, `reason` `program-missing` and `program` `notes-nope`, and nothing is approved.
- Given `notes-mcp` names the secret `notes-token` in `secretEnv`, and it isn't set,
  when `halonic tools review notes-mcp` runs,
  then it prints "✕ Couldn't list the tools from notes-mcp: it needs the secret notes-token, which isn't set." and "Set it with: halonic secret set notes-token", exits 2, and no program starts.
- Given `notes-mcp` at `http://127.0.0.1:47998/mcp` with nothing listening there,
  when `halonic tools review notes-mcp` or `halonic tools approve notes-mcp --all` runs,
  then it prints "✕ Nothing answered at http://127.0.0.1:47998/mcp." and "Start its server, or change the address in library/connectors/notes-mcp.connector.yaml." and exits 9.
- Given `notes-mcp`'s server stops before it answers,
  when `halonic tools approve notes-mcp --all` runs,
  then it prints "✕ The notes-mcp server stopped, or didn't answer in time, before it listed its tools." and exits 9.
