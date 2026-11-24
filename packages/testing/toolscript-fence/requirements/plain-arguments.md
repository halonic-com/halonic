# toolscript-fence.plain-arguments

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, a host function shall get a frozen plain-data copy of the script's argument, and the caller a frozen plain-data copy of the output, in both of which an own `__proto__` key stays a plain key and never changes the copy's prototype; each copy shall be made without running any of the script's code (no getter, `toJSON`, `valueOf`, `Symbol.toPrimitive` or prototype getter), and the run shall stop with `toolscript.bad-argument` for an argument that isn't plain data (an accessor, a function, a symbol, a class instance or another prototype, a non-finite number, `undefined`, a hole, a hidden key, a cycle, a second argument) or is over 8 levels, 100 items or 8,192 bytes of JSON.

## Examples

- Given an argument `{ get x() { … } }`,
  when the script passes it to a host function,
  then the run stops with `toolscript.bad-argument`, the getter never runs and the host function isn't called.
- Given a string of 8,190 characters (8,192 bytes of JSON),
  when it is passed,
  then the host gets it; with one more character the run stops with `toolscript.bad-argument`.
