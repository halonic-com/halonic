# Decision: a pinned connector also refuses a shell, folder and trust options, config-home variables and another program

- Requirements: `app.package-runner-launch`, `ports.connector-trust-enforcement`
- Task: HAL-2559, found by the maintainer while reviewing HAL-2527 (halonic#732). The decision and
  its reasons are the task's `decision` document.
- Approval: the maintainer decided the scope on the task and reviews this as the owner of
  `core/app` and `core/ports`

## What changes

Both requirements grow; nothing they allowed before is refused for a transport without a pin. For a
transport with a `pin`, `checkPackageRunnerLaunch` now also refuses:

- **A shell:** a `pin` on `cmd`, `sh`, `bash`, `zsh`, `powershell` or `pwsh`, whatever the shell
  runs. A shell can set a variable, run `npm config set` or write an `.npmrc` before the runner
  starts, and word inspection can't make that safe.
- **Shell options:** npm's `-c` and `--call`, pnpm's `-c` and `--shell-mode`, on `npx`, `pnpx`,
  `npm` and `pnpm`, with the shell's reason.
- **Options that move the folder, config, trust or proxy:** `--prefix`, `-C`, `--dir`, `--cwd`,
  `--directory`, `--project`, `--with-requirements`, `--with-editable`, `--constraints` (`-c`),
  `--overrides`, `--trusted-host`, `--allow-insecure-host`, `--proxy`, `--https-proxy`,
  `--cafile`, `--ca`, `--cert`, `--strict-ssl`, `--node-options` and pnpm's `--config.<key>`.
- **Variables that move the config home or program lookup:** `HOME`, `USERPROFILE`, `APPDATA`,
  `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `PATH`, `PATHEXT`, `COMSPEC`, as a fifth
  group with its own reason.
- **Another program:** with `-p`, `--package`, `--from`, `--with` or `--spec`, the runner starts
  its command word as a program, from the fetched packages or from `PATH`. That word must be the
  pin's package name, with or without its npm scope, so `npx -p <pin> sh …` is refused, and so is
  a package option with no command word.

- **Any program that isn't a package runner** (added in the maintainer's review of halonic#749): a
  `pin` on `env`, `node`, `wsl`, `busybox` or a shell not on the list above, such as `dash`, `fish`
  or `ksh`. A longer shell list can't close this, so the check is turned around: with a pin, only a
  package runner passes.
- **`pipx run --spec`** (same review): it gets the command-word check of `-p` and `--from`,
  because pipx's venv also holds `python`.

## Tests that changed

Two existing cases put a pinned runner behind `cmd`. They are still refused, now with the shell's
reason, so they moved instead of being weakened: the `cmd /c npx --registry=…` case went to the new
shell test, and the range case (`npx -y @acme/mail-mcp@^2.3.1`) now runs without `cmd`, so it still
tests the range refusal it was written for.

## Additions beyond the task's list

As in HAL-2527, I closed direct siblings, because leaving one open undoes the rest: `--cwd` (yarn's
and bun's `--dir`), uv's `--constraints` and `--overrides` (files that can hold index lines, like
`--with-requirements`), and pnpm's `--shell-mode` (its `-c`).

## Known costs, accepted for the safe side

- Like the existing options, these also match a word after the package, so a server that takes its
  own `--directory` or `--ca` is refused with a pin. It still starts unpinned. The fix, if it hurts,
  is for the launcher to build the argv itself (HAL-230), not to loosen this check.
- `-c` is compared as written for the shell options and in lowercase for the others, so npm's `-C`
  (`--prefix`) gets the folder reason and its `-c` the shell reason; `uvx -c` gets the folder
  reason. All three are refused.
- The command word is the first word after the subcommand that isn't an option or a package
  option's value. An option with a value of its own before it, such as `uvx --python 3.12 --from
  mail-mcp mail-mcp`, makes `3.12` look like the command word, so it is refused with a pin.
- `PATH` is often set by MCP configs to find `node`. With a pin that moves to the launcher, which
  finds the runner and `node` from the app's own environment (noted on HAL-230).
