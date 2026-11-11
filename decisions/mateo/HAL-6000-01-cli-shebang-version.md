# Decision: the CLI runs as a linked command and prints its version

- Requirements: `cli.help` (`apps/cli/requirements/help.md`), new `cli.version` (`apps/cli/requirements/version.md`)
- Task: HAL-6000, found on HAL-5994
- Approval: Liam decided the 0.1.0 source install as CLI owner on [HAL-6000](/HAL/issues/HAL-6000); he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lgsQvXz9CgQ8L5+3KanSgKM4rJyZ5aeiLfkpIckS0mAYjZxS3z9tdNWPL2Fih2ale61CMOIosKPGR1QFujUgDA==

## What changes

`apps/cli/src/main.ts` starts with `#!/usr/bin/env node`. `pnpm add -g ./apps/cli` makes a shim
that runs the `bin` file with the program its first line names; without the line the shim runs the
`.ts` file as a shell script, and on Windows the `.cmd` hands it to whatever program owns `.ts`.

`--version` is a new global option. It prints "halonic 0.1.0" from `src/version.ts` and exits
with 0, wherever it stands before a `--`. With `--json` the document follows `cli.json`:
`outputVersion` 1, `ok` true and `version`.

`cli.help`: with `--version` the options line would be 83 columns, so it now wraps at 80, every
line but the last ending with a comma: "Options for every command: --json, --no-color, --verbose,
--debug, --help," then "--version". The words stay the approved ones (HAL-1981, section 1.9).

The CI job "Fast gates" gets a step "CLI installs from source": it links the CLI with
`pnpm add -g ./apps/cli` into a `PNPM_HOME` under the runner's temp folder and runs `halonic --help`
and `halonic --version`, the steps the README gives.

## Why

For 0.1.0 the CLI installs from source, and on `main` there was no way to get a working `halonic`
command on the PATH. Kim's Install page (HAL-1152) waits on it.

## Tests

No test was weakened. The full `--help` test checks the wrapped line, new tests cover `--version`
with and without `--json`, after a command and after `--`, and the 80-column test still runs.

## Covers

- cli.help
- .github/
