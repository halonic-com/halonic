# events.harness-instructions

- Status: active
- Since: 0.1.0
- Source: task HAL-3106 (gap table in the migration plan on HAL-3035); Liam's decision on HAL-10110

The run log shall have a `harness.instructions` event, with the step's `state`, its `agent`, `files` and `sha256`, written before `harness.started`. `files` lists `AGENTS.md` and each skill file the harness runs with, each as `path`, relative to the run's folder, and `sha256`, the hash of that file's content. `sha256` is the hash of the whole set. The event never holds file contents or absolute paths, so a review can match hashes without the log leaking the instructions. Each event opens a timeline entry of its own. Older logs have no such event and read as before.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `harness.instructions` is among them, with `state`, `agent`, `files` and `sha256`, all required.
- Given an event with two files,
  when it is written to the log,
  then each file has a `path` and a `sha256` and nothing else.
