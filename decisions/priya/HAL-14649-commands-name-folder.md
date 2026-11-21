# Decision: the HTTP server's review command names the folder

- Approval: HAL-14649 (found in the C442 check on HAL-14638; the CTO, Liam, approves this note in review)
- Kind: user-visible

The `halonic tools review` command on the page of an MCP server over HTTP now
names the workspace folder with `--dir`, as every other command Studio shows to
copy does since HAL-12725, so it works from a new terminal. On a Windows folder
the page gives no command and says only "Studio can't list this server's tools
yet.": the CLI in WSL 2 keeps its approvals in the Linux profile, and Studio
reads those of the Windows profile (D-A, HAL-12822). The three requirements
gain these sentences and examples; nothing they already said changes.

## Covers

- app.halonic-command
- library.listed-tools-waiting
- studio.commands-name-folder
