# toolscript-fence.fresh-isolate

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, each run shall start in a fresh isolate, so a prototype write or a global from one run is never seen in the next.

## Examples

- Given a run that set `Object.prototype.polluted` and `globalThis.leftover`,
  when a second run reads both,
  then both are `undefined`.
