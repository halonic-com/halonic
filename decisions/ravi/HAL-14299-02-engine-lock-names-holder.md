# Decision: the engine lock names the command that holds it

- Approval: HAL-14299; Liam approves this note in review
- Kind: user-visible

## What changes

- `cli.local-engine-lock`: each CLI command that opens an engine (`run`, `runs send`,
  `routines watch`, `serve`) writes its name into `engine.lock`. A command the lock refuses
  names it: "halonic routines watch is running for this workspace (process 4242)." For a
  command that runs until it is stopped (`routines watch`, `serve`), the fix is "Stop it with
  Ctrl C there, then run again." instead of "Wait until it has finished or stop it, then run
  again.", which would never come true. A lock that names no command, such as the Studio's,
  or text that isn't one of these commands, keeps today's message.
- `fs-node.held-lock`: `holdLock` takes an optional `holder` and writes it into the record as
  `holder`, kept at every renewal. `RunLockRecord` in the ports gets the optional `holder`
  field. The format version stays 1: the Rust run lock reads only `version`, `pid`, `host`
  and `takenAt`, so the extra field doesn't matter to it, and the run store's lock writes
  none.

## Why

The C340 check (HAL-14271, row 31, code row C46) ran `halonic run` while `halonic routines
watch` was open: it refused with "Another Halonic engine is open … Wait until it has
finished", exit 5, but a watch never finishes. Nina's wording, in the form of the approved
C336/C337 messages, makes this a team decision (Liam, HAL-14299).

One change to her wording: it also said "or start runs in Studio". The Studio's desktop
engine holds the same `engine.lock` (`TauriEngineLock`), so Studio refuses too while the watch
is open, and that advice would send people to a second refusal. HAL-13758 (merged) reworded
only the Studio's own refusal. This builds on the CLI's existing text and doesn't touch the
Studio's. HAL-12412 doesn't touch this text.

## Covers

- cli.local-engine-lock
- fs-node.held-lock
