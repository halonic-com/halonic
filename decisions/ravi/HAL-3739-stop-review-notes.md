# Decision: what stopping does in three edge cases

- Requirement: `cli.stop` (`apps/cli/requirements/stop.md`)
- Task: HAL-3739; the three non-blocking notes from the review of #1002 on HAL-3473
- Approval: the maintainer approves this note in review
- Kind: internal

## What changes

`cli.stop` gets three sentences and three examples. Two write down what the CLI already does, one
is a fix:

- A command that finishes its work after the first Ctrl C or SIGTERM and returns a normal result
  keeps that result and its own exit code. The work did finish, so 130 would claim something
  that isn't true. A command that wants to stop early watches `context.signal` and returns that
  it stopped. No code changes; a test now pins it.
- A command that returns that it stopped although no signal came exits with 130, the code of
  Ctrl C, and prints its stop line as usual. A command can't name the signal itself, and 130 is
  what a shell shows for an interrupted command. No code changes; a test now pins it.
- A second Ctrl C or SIGTERM now waits until stdout and stderr have handed on what they still
  hold before the process ends. `process.exit` drops text a pipe's reader hasn't taken yet: on
  Linux, a 2 MB write piped to a slow reader arrived as 64 KiB. So a `--json` document could
  reach `jq` cut short. A third signal ends the process without waiting, so a reader that never
  reads can't keep it open. "Stopped." is printed once, however many signals come.

One sentence is added to the requirement's text and three examples are added; none is removed or
changed.

## Tests

No guard was weakened. New tests: `exitOnceWritten` exits at once with nothing held, only after
every stream hands on what it held, and at once on a further call while it waits. Through
`runCli`: a third signal prints no second "Stopped.", a command that finishes after Ctrl C keeps
its result and code 0, and a command that says it stopped with no signal ends with 130.

## Covers

- cli.stop
