# app.package-runner-launch

- Status: active
- Since: 0.1.0
- Source: HAL-1132 (release check C93), the package-runner and environment rules of `ports.connector-trust-enforcement`

The app shall treat a stdio `command` as a package runner when its program name, without its folder, in any case and without a `.cmd`, `.exe`, `.bat` or `.ps1` ending, is `npx`, `bunx`, `uvx` or `pnpx`, or is one of `npm exec`, `npm x`, `pnpm dlx`, `yarn dlx`, `bun x`, `pipx run` and `uv tool run`. It shall refuse a package runner without a `pin`, a `pin` whose version isn't one exact version as `app.connector-pin-version` defines it, and a transport with a `pin` whose `env` sets, in any case, `NODE_OPTIONS`, `NODE_PATH`, `PYTHONPATH`, `PYTHONSTARTUP`, `PYTHONHOME`, or a name starting with `npm_config_`, `YARN_`, `PNPM_`, `BUN_`, `COREPACK_`, `UV_`, `PIP_` or `PIPX_`.

`npm x`, `bun x` and `pnpx` are aliases the tools document, so they count too. A subcommand counts wherever it appears in the arguments, so an option before it doesn't hide it.

## Examples

- Given a stdio transport with `command: "NPX.CMD"`, `args: ["-y", "@acme/mail-mcp"]` and no `pin`,
  when it is checked,
  then it is refused because a package runner needs a pin.
- Given the command `C:/tools/uvx.exe`, `bunx`, `pnpx`, `npm` with `--yes exec`, `npm` with `x`, `pnpm dlx`, `yarn dlx`, `bun x`, `pipx run` or `uv tool run`,
  when it is checked,
  then it is a package runner.
- Given the command `node` with `server.js`, `python` with `-m mail_mcp`, `npm` with `start`, or `uv` with `run server.py`,
  when it is checked without a pin,
  then it isn't a package runner and passes.
- Given a pinned stdio transport whose `pin.version` is `latest` or `^2.3.1`,
  when it is checked,
  then it is refused.
- Given a pinned stdio transport whose `env` sets `node_options` to `--require ./evil.js` or `NPM_CONFIG_REGISTRY` to another address,
  when it is checked,
  then it is refused.
- Given a pinned stdio transport for `@acme/mail-mcp` at `2.3.1` whose `env` sets only `MAIL_ACCOUNT`,
  when it is checked,
  then it passes with the pin.
