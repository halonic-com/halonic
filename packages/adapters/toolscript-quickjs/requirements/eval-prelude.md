# toolscript-quickjs.eval-prelude

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, section 2.1), with the security conditions on HAL-17650; task HAL-17569

The QuickJS adapter shall run its fixed eval prelude as its own evaluation before the script, shall check through the QuickJS API that `eval`, `Function` and the `constructor` of the four function prototypes each hold one frozen thrower as a non-writable, non-configurable property that `Function.prototype` is frozen, and that `Error.prepareStackTrace` is pinned to a non-writable, non-configurable `undefined` (so a script's stack hook never runs, not even for an error the engine makes during the host's own calls), shall not run the script when the prelude throws or the check fails, and shall check the slots again after the run.

## Examples

- Given a prelude that leaves out `Object.freeze(thrower)`,
  when a run starts,
  then it ends with `toolscript.failed` and the script's host call never happens.
- Given a script that tries to redefine, delete and assign every slot,
  when it reads the slots back,
  then each still holds the same thrower, non-writable and non-configurable.
