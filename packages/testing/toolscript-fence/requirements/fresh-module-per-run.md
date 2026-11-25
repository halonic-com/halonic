# toolscript-fence.fresh-module-per-run

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, section 2.1 and the T4 fence list in section 6, revision 8), the board's choice on HAL-17781; tasks HAL-17847 and HAL-17780

Where an isolate implements `ToolScriptIsolate`, each run on the same isolate in the same host process shall start on a module instance and memory that no earlier run used, so neither a global nor a value held in the heap by one run is seen in the next.

## Examples

- Given a run that held 4 MB of strings in `globalThis.kept` and set `Object.prototype.polluted`, under an 8 MB memory limit,
  when a second run on the same isolate reads both and then holds its own 4 MB,
  then both are `undefined` and the second run ends normally.
