# toolscript-fence.limits

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, a run shall stop with `limit.cpu`, `limit.memory`, `limit.stack`, `limit.promises` (the 33rd pending host call), `limit.calls` (the 51st host call for an agent), `limit.input`, `limit.output`, `limit.log` (the 201st line) or `limit.wall-clock` when that limit is passed, shall cut a log line to 300 characters, shall not count time spent waiting on a host function as CPU, and shall stop with a host function's `ToolScriptStop` reason or `toolscript.cancelled` when the caller cancels.

## Examples

- Given a script with `for (;;) {}` and a CPU limit of 100 ms,
  when it runs,
  then it stops with `limit.cpu`.
- Given a host function that takes three seconds and a CPU limit of 100 ms,
  when the script awaits it,
  then the run finishes.
