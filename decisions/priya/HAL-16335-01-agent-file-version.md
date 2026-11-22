# Decision: `run` and `runs send` check "On this computer" against the run's version of the agent file

- Approval: HAL-16335 (scope set on the task; Liam reviews and signs)
- Kind: user-visible

## What changes

`halonic run` and `halonic runs send` start a run from the live version (or the saved files with
history off). The "On this computer" choice holds for one agent file's exact bytes, and both
commands now check it against the agent file of that version: the sandbox check before the engine
opens reads the file from the load the run starts from, and the harness host's placement check
reads it from the version the run recorded. A saved change to the agent file that isn't live no
longer counts. `halonic routines watch` and `halonic serve` already read it this way.

`cli.sandbox-gate` says "for its file as the version the run starts has it" where it said "for its
file as it is now", and gains two examples. `cli.local-harness-host` names `run` and `runs send`
next to `routines watch`. No example was removed or weakened.

## Why

A person's yes to run an agent without the sandbox covers exactly the file it was given for, so it
is checked against the file the run's steps come from, the same one `routines watch` checks.

## Covers

- cli.sandbox-gate
- cli.local-harness-host
