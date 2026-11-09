# app.package-runner-launch

- Status: active
- Since: 0.1.0
- Source: HAL-1132 (release check C93), the package-runner and environment rules of `ports.connector-trust-enforcement`; HAL-2134 (release check C188: an unpinned package runner starts once a person has trusted it)

The app shall treat a stdio `command` as a package runner when its program name, without its folder, in any case and without a `.cmd`, `.exe`, `.bat` or `.ps1` ending, is `npx`, `bunx`, `uvx` or `pnpx`, or is one of `npm exec`, `npm x`, `pnpm dlx`, `yarn dlx`, `bun x`, `pipx run` and `uv tool run`, or when it is `cmd`, `sh`, `bash`, `zsh`, `powershell` or `pwsh` and any word of its arguments, split on spaces, quotes and `;`, `&`, `|`, `(`, `)`, starts a package runner. It shall refuse a `pin` whose version isn't one exact version as `app.connector-pin-version` defines it, and a transport with a `pin` whose `env` sets, in any case, `NODE_OPTIONS`, `NODE_PATH`, `PYTHONPATH`, `PYTHONSTARTUP`, `PYTHONHOME`, or a name starting with `npm_config_`, `YARN_`, `PNPM_`, `BUN_`, `COREPACK_`, `UV_`, `PIP_` or `PIPX_`. A package runner without a `pin` passes this check: like every stdio program it starts only with a trust grant, and its command and args are in the fingerprint the person confirmed. The trust check marks it as not pinned with the same detection (build plan item 10c), so the two can't disagree.

For a pinned package runner, the app shall read the package each word names: the value of `-p`, `--package`, `--from`, `--with` (split on commas) or `--spec`, and any other word that starts with the pin's package name. It shall refuse the launch when no word names the pin's package, when a named package isn't the pin's (PyPI names compared the way PyPI compares them), and when a named version isn't the pin's version or isn't one exact version as `app.connector-pin-spec` reads it. The pin's package without a version passes, because the launcher adds the pin. For PyPI, `name@1.2.3` is read as `name==1.2.3`, the form `uvx` also accepts.

`npm x`, `bun x` and `pnpx` are aliases the tools document, so they count too. A subcommand counts wherever it appears in the arguments, so an option before it doesn't hide it. A shell counts even when the runner name is only text it prints, such as `echo npx`; that errs to the safe side.

## Examples

- Given a stdio transport with `command: "NPX.CMD"`, `args: ["-y", "@acme/mail-mcp"]` and no `pin`,
  when it is checked,
  then it passes without a pin, and `isPackageRunner` is still true for it.
- Given the command `C:/tools/uvx.exe`, `bunx`, `pnpx`, `npm` with `--yes exec`, `npm` with `x`, `pnpm dlx`, `yarn dlx`, `bun x`, `pipx run` or `uv tool run`,
  when it is checked,
  then it is a package runner.
- Given the command `cmd` with `/c`, `npx`, `-y`, `@acme/mail-mcp`, or `sh` with `-c` and `exec uvx mail-mcp`, or `powershell` with `-Command` and `& 'npx.cmd' -y @acme/mail-mcp`, and no `pin`,
  when it is checked,
  then it is a package runner and passes without a pin.
- Given the command `node` with `server.js`, `python` with `-m mail_mcp`, `npm` with `start`, or `uv` with `run server.py`,
  when it is checked without a pin,
  then it isn't a package runner and passes.
- Given a pinned stdio transport whose `pin.version` is `latest` or `^2.3.1`,
  when it is checked,
  then it is refused.
- Given a pinned stdio transport whose `env` sets `node_options` to `--require ./evil.js` or `NPM_CONFIG_REGISTRY` to another address,
  when it is checked,
  then it is refused.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` whose `args` are `-y` and `@acme/mail-mcp@3.0.0`, or `-y` and `@acme/mail-mcp@latest`,
  when it is checked,
  then it is refused because the command names another version.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` whose `args` are `-p`, `other-pkg` and `mail-mcp`, or `-y` and `other-pkg`,
  when it is checked,
  then it is refused because the command names another package, or doesn't name the pinned one.
- Given a stdio transport pinned to `mail-mcp` at `2.3.1` with `command: "uvx"` and `args` of `Mail_MCP`, `mail-mcp==2.3.1`, `mail-mcp@2.3.1`, or `--from`, `mail-mcp==2.3.1` and `mail-mcp`,
  when it is checked,
  then it passes with the pin.
- Given a pinned stdio transport for `@acme/mail-mcp` at `2.3.1` whose `env` sets only `MAIL_ACCOUNT`,
  when it is checked,
  then it passes with the pin.
