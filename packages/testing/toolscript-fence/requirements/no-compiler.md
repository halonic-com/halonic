# toolscript-fence.no-compiler

- Status: active
- Since: unreleased
- Source: ADR "Halonic ToolScript" (`docs/adr/2026-11-24-toolscript.md`, the T4 fence list in section 6), accepted by the board on HAL-10 on 24 Nov; task HAL-17569

Where an isolate implements `ToolScriptIsolate`, it shall refuse every path from a script to the compiler (`eval`, indirect `eval`, `Function`, and the constructor of plain, arrow, method, class, bound, async, generator and async-generator functions, reached directly, through `Reflect.construct` or through the iterator prototypes), also after the script tried to redefine, delete or assign them, shall refuse `import()` of any name or URL and a static import, and shall keep plain, async and generator functions working.

## Examples

- Given a script that calls `(async () => {}).constructor('return 1')`,
  when it runs,
  then the call throws, and the script's own async functions still run.
- Given a script that runs `await import('data:text/javascript,export default 1')`,
  when it runs,
  then the import is refused.
