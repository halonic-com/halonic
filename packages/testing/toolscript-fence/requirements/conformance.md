# toolscript-fence.conformance

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, every result shall report the limits the run really had (the host's declared ones included), every failure shall carry a reason from the `ToolScriptHost` list, a script's error shall carry only its message, cut to 300 characters and with no stack frames, and a host function's own error message shall never be passed on.

## Examples

- Given a script that throws `new Error("acme broke")` from a nested function,
  when it runs,
  then the result is `toolscript.script-error` with the message `acme broke`.
