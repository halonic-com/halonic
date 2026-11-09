# cli.commands.validate.old-output

- Status: active
- Since: 0.1.0
- Source: HAL-1892 (HAL-187 work plan, item 5); the old `studio validate` at 784f78d, recorded in `testing/parity`

The `halonic validate <dir>` command shall load the workspace in `dir` and print, in the old `studio validate`'s format, one line per error (`error <file>: <message>`) and per warning (`warn  <file>: <message>`), with `YAML: ` before the message for text that isn't YAML and the key path before it for a problem in a file's own data. It shall then print `<n> error(s)` and exit with 1 when there is an error, or `OK: <name>, <hubs> hub(s), <warnings> warning(s)` and exit with 0 when there is none.

## Examples

- Given the parity fixtures' base workspace, when `halonic validate` runs on it, then it prints `OK: Acme, 1 hub(s), 0 warning(s)`, as the old command did, and exits with 0.
- Given the parity case `agent/bad-colour`, when `halonic validate` runs on it, then it prints `error hubs/billing/agents/clerk.agent.yaml: character.colors.0: …` and `1 error(s)`, and exits with 1.
- Given the parity case `workspace/yaml-syntax`, when `halonic validate` runs on it, then it prints `error workspace.yaml: YAML: Missing closing "quote` and `1 error(s)`, as the old command did.
- Given the parity case `connector/approve-not-allowed`, when `halonic validate` runs on it, then it prints the `warn  ` line, then `OK: Acme, 1 hub(s), 1 warning(s)`, and exits with 0.
- Given no folder, or two, when `halonic validate` runs, then it exits with 2.
