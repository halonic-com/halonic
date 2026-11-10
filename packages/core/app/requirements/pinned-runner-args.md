# app.pinned-runner-args

- Status: active
- Since: 0.1.0
- Source: HAL-230 and HAL-2544 (the pinned stdio launcher starts the pin's package at its version, as the `pin` doc in `ports/connector-client.ts` says: "the launcher adds the pin"); Liam's review on HAL-4094 (a package option after the command word, and `@` for `uvx`)

When a launcher asks for the arguments to start a pinned package runner with, for a command and arguments that `app.package-runner-launch` let through, the app shall read the runner's own options and its command word the way `app.package-runner-launch` reads them, and change only those. Each value of `-p`, `--package`, `--from`, `--with` (each of its comma-separated specs) or `--spec` among the runner's options, written with a space or an `=`, that names the pin's package shall name it at the pin's version: `name@version` for npm, `name==version` for PyPI. Without such an option, the command word shall name the pin's package at the pin's version: `name@version` for npm runners, `uvx` and `uv tool run`, and `--spec name==version` followed by the command word's package name for `pipx run`, the form each runner documents. With such an option, the command word is a program name, such as `mail-mcp` in `uvx --from mail-mcp mail-mcp`, and shall stay as it is. The words after the command word are the server's own arguments and shall stay as they are, even when one of them looks like a package option.

## Examples

- Given the pin `@acme/mail-mcp` 2.3.1 and `npx` with `-y`, `@acme/mail-mcp`,
  when the arguments to start with are asked for,
  then they are `-y`, `@acme/mail-mcp@2.3.1`.
- Given the same pin and `npm` with `exec`, `--package=@acme/mail-mcp`, `--`, `mail-mcp`,
  when they are asked for,
  then they are `exec`, `--package=@acme/mail-mcp@2.3.1`, `--`, `mail-mcp`.
- Given the PyPI pin `mail-mcp` 2.3.1 and `uvx` with `Mail_MCP`, `--port`, `0`,
  when they are asked for,
  then they are `mail-mcp@2.3.1`, `--port`, `0`.
- Given the same pin and `pipx` with `run`, `mail-mcp`,
  when they are asked for,
  then they are `run`, `--spec`, `mail-mcp==2.3.1`, `mail-mcp`.
- Given the same pin and `uvx` with `--from`, `Mail_MCP`, `mail-mcp`,
  when they are asked for,
  then they are `--from`, `mail-mcp==2.3.1`, `mail-mcp`.
