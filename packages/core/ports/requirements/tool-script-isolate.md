# ports.tool-script-isolate

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, sections 2, 3.2 S7, S13, S15 and 5), accepted by the board on HAL-10 on 24 Nov; task HAL-17741 (T4 on HAL-17569)

The ports package shall have a `ToolScriptIsolate` port (version 1) that runs one ToolScript's code in a fresh isolate with an input, host functions by name or namespace, and a run's limits, and answers with the output or with a reason from the `ToolScriptHost` list, together with the log and the limits it really applied. `toolScriptSecretHandle` shall make a frozen secret handle that carries a registered symbol mark, and `isToolScriptSecretHandle` shall accept only a value with that mark, never a copy of it as plain data. `isToolScriptStop` shall accept a `ToolScriptStop`, or an `Error` named `ToolScriptStop` from another copy of the package, only when its reason is listed.

## Examples

- Given a handle made with `toolScriptSecretHandle("acme-deploy-key")`,
  when it is checked,
  then it is frozen and is a secret handle, and its JSON copy is not.
- Given an `Error` named `ToolScriptStop` with the reason `toolscript.declined`,
  when it is checked,
  then it is a stop; with the reason `limit.x`, it is not.
