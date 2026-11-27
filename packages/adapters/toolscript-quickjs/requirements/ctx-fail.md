# toolscript-quickjs.ctx-fail

- Status: active
- Since: unreleased
- Source: task HAL-20448, for the `ctx` host's contract (HAL-17570); `ports.tool-script-host` reserves `fail` as one of `ctx`'s own members

When a script calls `ctx.fail(message)`, with or without `await`, the QuickJS adapter shall end the run at once with `toolscript.failed` and the message, cut to `toolScriptMessageCharacters`, and the script shall run no further; it shall refuse a host function named `fail`.

## Examples

- Given the script `export async function run(ctx) { ctx.fail("nothing to copy"); }`,
  when it runs,
  then the result is `toolscript.failed` with the message "nothing to copy".
- Given a script that catches the error `ctx.fail` throws and returns a value,
  when it runs,
  then the result is still `toolscript.failed`.
