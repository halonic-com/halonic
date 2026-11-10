# app.pinned-runner-args

- Status: active
- Since: 0.1.0
- Source: HAL-230 and HAL-2544 (the pinned stdio launcher starts the pin's package at its version, as the `pin` doc in `ports/connector-client.ts` says: "the launcher adds the pin")

For a pinned package runner's arguments that `app.package-runner-launch` let through, the app shall give the arguments to start it with. Each value of `-p`, `--package`, `--from`, `--with` (each of its comma-separated specs) or `--spec`, written with a space or an `=`, that names the pin's package shall name it at the pin's version: `name@version` for npm, `name==version` for PyPI. Without such an option, the first word naming the pin's package, with or without a version, shall name it at the pin's version. Every other word shall stay as it is, so a command word such as `mail-mcp` in `uvx --from mail-mcp mail-mcp` and the server's own arguments are passed on unchanged.

## Examples

- Given the pin `@acme/mail-mcp` 2.3.1 and the arguments `-y`, `@acme/mail-mcp`,
  when the arguments to start with are asked for,
  then they are `-y`, `@acme/mail-mcp@2.3.1`.
- Given the same pin and `exec`, `--package=@acme/mail-mcp`, `--`, `mail-mcp`,
  when they are asked for,
  then they are `exec`, `--package=@acme/mail-mcp@2.3.1`, `--`, `mail-mcp`.
- Given the PyPI pin `mail-mcp` 2.3.1 and `--from`, `Mail_MCP`, `mail-mcp`,
  when they are asked for,
  then they are `--from`, `mail-mcp==2.3.1`, `mail-mcp`.
