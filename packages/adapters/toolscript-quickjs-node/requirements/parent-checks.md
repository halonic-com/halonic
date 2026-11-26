# toolscript-quickjs-node.parent-checks

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, section 2.2, S16), task HAL-18669 and Liam's plan approval there

The Node worker isolate shall check every result a worker sends before it gives it on: it shall be `ok` with plain data and at most `logLines` log lines of at most `logLineCharacters` each, or a listed reason with a message of at most 300 characters; anything else, or any message before the worker has said it started, shall end the run with `toolscript.failed`. The parent shall measure the output's size as UTF-8 JSON itself and end a run whose output is over `outputBytes` with `limit.output`, whatever the worker reports, and the limits in the result shall be the parent's own.

## Examples

- Given a worker whose result has a log that isn't a list,
  when the run ends,
  then the result is `toolscript.failed` with no log.
- Given a worker whose output is 70,000 characters under a 64 KB `outputBytes`,
  when the run ends,
  then the result is `limit.output`.
