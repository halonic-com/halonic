# cli.commands.tools.start-failure

- Status: active
- Since: unreleased
- Source: HAL-13829 (CN3 of the C248 check on HAL-13818; wording decided by the team)

When the connector a `halonic tools` command lists the tools of doesn't start because its program isn't on this computer, or because a secret it needs isn't set, as `connectorStartFailureOf` reads the error, the command shall fail with exit 4 (`not_found`) and name the cause the person can fix: "Couldn't list the tools from <source>: its program <program> isn't on this computer." with the fix "Install it, or change the command in <connector file>.", where the connector file is its path in the workspace; or "Couldn't list the tools from <source>: it needs the secret <secret>, which isn't set." with the fix "Set it with: halonic secret set <secret>". It shall name the program and the secret as the connector's file writes them, never a secret's value or the error's own text. Any other error shall keep the line it had.

## Examples

- Given Acme's `notes-mcp`, whose program `notes-mcp` isn't on this computer,
  when `halonic tools review notes-mcp` runs,
  then it says "✕ Couldn't list the tools from notes-mcp: its program notes-mcp isn't on this computer." and "Install it, or change the command in library/connectors/notes-mcp.connector.yaml.", and exits 4.
- Given `notes-mcp` with `secretEnv: { NOTES_TOKEN: notes-token }` and no secret `notes-token`,
  when `halonic tools review notes-mcp` runs,
  then it says "✕ Couldn't list the tools from notes-mcp: it needs the secret notes-token, which isn't set." and "Set it with: halonic secret set notes-token", starts nothing and exits 4.
- Given the program missing,
  when `halonic tools approve notes-mcp --all --json` runs,
  then the document's `error` has kind `not_found` and the same sentence and fix.
