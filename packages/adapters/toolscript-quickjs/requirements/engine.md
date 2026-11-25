# toolscript-quickjs.engine

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, section 2.1), task HAL-17780 and Liam's plan review there

The QuickJS adapter shall run every ToolScript on its own QuickJS-ng build, made from the release, wrapper files and emsdk image pinned by sha256 in `engine/SOURCES.json`, reporting the pinned quickjs-ng version (0.13.0 or later) from the engine itself; each run shall get a WebAssembly memory whose initial and maximum size are both the engine's own memory plus the run's `memoryBytes`, so the memory never grows, and running out of it shall end the run with a reason, never a trap.

## Examples

- Given the committed engine,
  when it is asked for its version,
  then it answers the version in `engine/SOURCES.json`, such as `0.18.0`.
- Given a script that joins iterators with `Iterator.concat` and closes them early,
  when it runs,
  then the run ends with its result or a fixed reason.
- Given an engine with QuickJS's own memory limit lifted,
  when a script allocates past the fixed memory,
  then the script gets an out-of-memory error and the memory is still its fixed size.
