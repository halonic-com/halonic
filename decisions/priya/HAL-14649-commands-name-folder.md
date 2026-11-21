# Decision: the HTTP server's review command names the folder

- Approval: HAL-14649 (found in the C442 check on HAL-14638); HAL-14995 (Liam's decision, option 4); the CTO, Liam, approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/3I7GMkVhZiEAWAHRtZNvfHnDmc8c7mMsjSQtqEoIIqhLaRjL1bei+5c3IdLLf3c9+pjxAUXq4K5vbQUMdb+BQ==

The `halonic tools review` command on the page of an MCP server over HTTP now
names the workspace folder with `--dir`, as every other command Studio shows to
copy does since HAL-12725, so it works from a new terminal. On a Windows folder
the page gives no command and says only "Studio can't list this server's tools
yet.": the CLI in WSL 2 keeps its approvals in the Linux profile, and Studio
reads those of the Windows profile (D-A, HAL-12822). The three requirements
gain these sentences and examples; nothing they already said changes.

## A missing connector secret gives no command (HAL-14995)

`library.listed-tools-waiting` changes what it already said: a connector's
secret that isn't set, or that its server refused, no longer comes with
`halonic secret set` to run. That command writes the profile's secrets file,
and Studio reads a connector's secrets from the keychain, so following it
couldn't fix the line on any computer. The line now names the secret and ends
"Studio can't set a connector's secrets yet."; its two examples change to
match. Liam chose this stopgap on HAL-14995; a secret field on the connector
page that writes the keychain follows there as its own pull request.

## Covers

- app.halonic-command
- library.listed-tools-waiting
- studio.commands-name-folder
