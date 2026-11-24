# ports.tool-script-host

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, sections 2.3, 3.2 and 5), accepted by the board on HAL-10 on 24 Nov; task HAL-17566

The ports package shall have a `ToolScriptHost` port (version 1) that runs a built ToolScript artifact for one audience, `user` or `agent`, with a capability registry, an input, optional lower limits and a confirm step for writes, and answers with the output or with a reason from a fixed list, together with the capability ids called and the log. It shall give each audience the ADR's default limits, and `effectiveToolScriptLimits` shall only lower a host's limits, ignore a `null` wall clock, and throw a `RangeError` for a value that isn't a positive whole number or a name that isn't a limit. `toolScriptCapabilityPath` shall place a capability id `<namespace>.<name>@<version>` on `ctx` as `ctx.<namespace>.<camelCasedName>`, and give nothing for any other id.

## Examples

- Given the agent defaults and the lower sets `{ calls: 10, cpuMs: 5000 }` and `{ calls: 20, wallClockMs: null }`,
  when the effective limits are worked out,
  then `calls` is 10, `cpuMs` stays 2000 and `wallClockMs` stays 60000.
- Given the lower set `{ calls: 0 }`,
  when the effective limits are worked out,
  then it throws a `RangeError`.
- Given the capability id `github.set-variable@1`,
  when its path is read,
  then it is the namespace `github` and the method `setVariable`.
- Given the id `Github.setVariable@1`,
  when its path is read,
  then there is none.
