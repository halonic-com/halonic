# toolscript-quickjs.isolate

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, section 2.1), with the security conditions on HAL-17650; task HAL-17569

The QuickJS adapter shall run each ToolScript in a WASM module, runtime and context of its own, in a WASM memory of a fixed size (the module's own 16 MiB plus the run's memory limit) that is the hard memory limit, shall end a run whose WASM memory traps with `limit.memory` and never pass the trap on, with the lower of its own limits and the request's, counting CPU only while code runs inside the isolate, giving each secret handle a random 128-bit id known only to that run's table, and refusing a host function named `input` or `log`; it shall pass the `toolscript-fence` suite.

## Examples

- Given an isolate made with 16 MB of memory and a request with the agent defaults,
  when a script runs,
  then the result reports the agent defaults with 16 MB.
- Given 60 ms inside the isolate, then 5 s waiting on the host, with a CPU limit of 100 ms,
  when the meter is asked,
  then it doesn't interrupt.
