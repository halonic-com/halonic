# Decision: halonic --help names the options every command takes

- Requirement: `cli.help` (`apps/cli/requirements/help.md`)
- Task: HAL-2223, the follow-up from HAL-2147 (#672)
- Approval: the task asks for this change; the maintainer approves this note in review

## What changes

Since #672 every command takes `--debug`, but the help didn't name it: the only place a user could
learn of it was a bug's second line. `cli.help` now says that `halonic --help` prints, after the
commands, "Options for every command:" and each option every command takes, and names only options
the CLI reads.

The line uses the words of the CLI output draft as written (HAL-1981 cli-output, section 1.9; the
board approved the draft on HAL-2123). The draft lists `--json, --no-color, --verbose, --debug,
--help`; only `--debug` and `--help` exist today, so the line is "Options for every command:
--debug, --help". The others join it when they are built.

The list lives in one place, `globalOptionFlags` in `apps/cli/src/global-options.ts`, next to the
code that reads the options, so a new global option shows up in the help by itself. `--help` and
`-h` moved there from `run-cli.ts` for the same reason.

## Tests

No test was weakened. The full `--help` output test checks the new line, and a new test checks
that every option on the line is one the CLI reads.
